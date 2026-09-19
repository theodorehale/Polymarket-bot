/**
 * Backtest Replay Engine (PROBLEMS.md P11)
 *
 * Replays historical snapshots through the same pure executable-edge engine
 * used to decide whether a YES/NO pair is safe to execute. The replay layer
 * only adapts snapshot data into ExecutableBook inputs and records accepted
 * quotes as BacktestTrade rows.
 */

import { getEffectivePrices } from '../utils/price-utils.js';
import type { PriceLevel } from '../utils/price-utils.js';
import {
  findSafePairSize,
  type ExecutableBook,
  type ExecutableQuoteInput,
  type FeeModel,
} from '../utils/executable-edge.js';
import { summarizeTrades } from './metrics.js';
import type {
  BacktestConfig,
  BacktestMetrics,
  BacktestSnapshot,
  BacktestStrategy,
  BacktestTrade,
} from './types.js';

export interface BacktestResult {
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
}

/** Fee-aware signal generation remains strategy-level; execution is gated later. */
export function longArbStrategy(
  snapshot: BacktestSnapshot,
  _index: number,
  opts: { profitThreshold?: number } = {}
): { type: 'long' | 'flat'; size: number } {
  const e = getEffectivePrices(
    snapshot.yesAsk,
    snapshot.yesBid,
    snapshot.noAsk,
    snapshot.noBid
  );
  const profit = 1 - (e.effectiveBuyYes + e.effectiveBuyNo);
  return profit > (opts.profitThreshold ?? 0)
    ? { type: 'long', size: Number.POSITIVE_INFINITY }
    : { type: 'flat', size: 0 };
}

/**
 * Legacy helper retained for callers/tests. New replay execution does not use
 * this helper; exact-share fills are performed by executable-edge.ts.
 */
export function fillLadder(
  levels: PriceLevel[],
  size: number
): { filled: number; notional: number } {
  let filled = 0;
  let notional = 0;
  for (const l of levels) {
    if (filled >= size) break;
    if (!Number.isFinite(l.price) || !Number.isFinite(l.size) || l.size <= 0) continue;
    const take = Math.min(l.size, size - filled);
    filled += take;
    notional += take * l.price;
  }
  return { filled, notional };
}

/** Total positive finite size resting on a ladder. */
export function ladderSize(levels: PriceLevel[]): number {
  return levels.reduce(
    (sum, level) => sum + (Number.isFinite(level.size) && level.size > 0 ? level.size : 0),
    0
  );
}

function touchLevel(price: number, size: number | undefined, fallbackSize: number): PriceLevel[] {
  return [{ price, size: size ?? fallbackSize }];
}

function booksFromSnapshot(
  snapshot: BacktestSnapshot,
  fallbackSize: number
): { yesBook: ExecutableBook; noBook: ExecutableBook } {
  const levels = snapshot.levels;
  return {
    yesBook: {
      asks: levels?.yesAsks ?? touchLevel(snapshot.yesAsk, snapshot.yesAskSize, fallbackSize),
      bids: levels?.yesBids ?? touchLevel(snapshot.yesBid, snapshot.yesBidSize, fallbackSize),
      timestampMs: snapshot.ts,
    },
    noBook: {
      asks: levels?.noAsks ?? touchLevel(snapshot.noAsk, snapshot.noAskSize, fallbackSize),
      bids: levels?.noBids ?? touchLevel(snapshot.noBid, snapshot.noBidSize, fallbackSize),
      timestampMs: snapshot.ts,
    },
  };
}

function feeModel(rateBps: number): FeeModel {
  return rateBps === 0
    ? { status: 'known', kind: 'zero' }
    : { status: 'known', kind: 'flat_bps', rateBps };
}

/**
 * Convert one backtest signal into the shared executable-edge input and find
 * the largest safe exact-share pair. This is the replay/live math boundary:
 * replay must not independently recompute VWAP, fees, worst case, or net edge.
 */
export function quoteBacktestSignal(
  snapshot: BacktestSnapshot,
  signal: ReturnType<BacktestStrategy>,
  config: BacktestConfig = {}
) {
  if (signal.type === 'flat' || !(signal.size > 0)) return null;

  const maxTradeSize = config.maxTradeSize ?? 100;
  const maxPairShares = Math.min(signal.size, maxTradeSize);
  if (!(Number.isFinite(maxPairShares) && maxPairShares > 0)) return null;

  const feeRateBps = config.feeRateBps ?? 0;
  const gasCostUsd = config.gasCostUsd ?? 0;
  const minNetProfitUsd = config.minNetProfitUsd ?? 0;
  const maxAdverseSlippageBps = config.maxAdverseSlippageBps ?? 0;
  const sizeStepShares = config.sizeStepShares ?? 0.01;
  const { yesBook, noBook } = booksFromSnapshot(snapshot, maxTradeSize);

  const shared: Omit<ExecutableQuoteInput, 'targetPairShares'> = {
    type: signal.type,
    yesTokenId: 'BACKTEST_YES',
    noTokenId: 'BACKTEST_NO',
    yesBook,
    noBook,
    yesFee: feeModel(feeRateBps),
    noFee: feeModel(feeRateBps),
    costs: {
      expectedGasUsd: gasCostUsd,
      worstCaseGasUsd: gasCostUsd,
      expectedOtherCostsUsd: 0,
      worstCaseOtherCostsUsd: 0,
    },
    nowMs: snapshot.ts,
    maxBookAgeMs: 0,
    maxBookSkewMs: 0,
    maxFutureDriftMs: 0,
    maxAdverseSlippageBps,
    thresholds: {
      minExpectedNetProfitUsd: minNetProfitUsd,
      minWorstCaseNetProfitUsd: minNetProfitUsd,
      minExpectedNetEdgeBps: 0,
      minWorstCaseNetEdgeBps: 0,
    },
  };

  return findSafePairSize({
    ...shared,
    maxPairShares,
    minPairShares: Math.min(sizeStepShares, maxPairShares),
    sizeStepShares,
  });
}

export function runBacktest(
  snapshots: BacktestSnapshot[],
  strategy: BacktestStrategy,
  config: BacktestConfig = {}
): BacktestResult {
  const startingEquity = config.startingEquity ?? 250;
  const gasCostUsd = config.gasCostUsd ?? 0;
  const trades: BacktestTrade[] = [];

  snapshots.forEach((snapshot, index) => {
    const signal = strategy(snapshot, index);
    const quote = quoteBacktestSignal(snapshot, signal, config);
    if (!quote?.safeToExecute) return;

    const size = quote.targetPairShares;
    const twoLegNotional =
      quote.yesLeg.expectedNotionalUsd + quote.noLeg.expectedNotionalUsd;
    const feeUsd = quote.expectedFeesUsd ?? 0;

    trades.push({
      ts: snapshot.ts,
      type: quote.type,
      size,
      entryCost: quote.type === 'long' ? twoLegNotional : size,
      exitValue: quote.type === 'long' ? size : twoLegNotional,
      feeUsd,
      gasUsd: gasCostUsd,
      pnl: quote.expectedNetProfitUsd,
    });
  });

  return { trades, metrics: summarizeTrades(trades, startingEquity) };
}

/** Parse a JSONL string into snapshots (skips blank lines; throws on invalid). */
export function parseSnapshotsJsonl(jsonl: string): BacktestSnapshot[] {
  const out: BacktestSnapshot[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as BacktestSnapshot);
  }
  return out;
}
