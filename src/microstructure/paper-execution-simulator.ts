import type { PaperExecutionAttempt, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

export interface PaperExecutionConfig {
  latencyMs: number;
  feeRate?: number;
  minNetEdge?: number;
  maxBookAgeMs?: number;
}

export interface PaperSignal {
  attemptId: string;
  marketId: string;
  tokenId: string;
  signalReceivedAtMs: number;
  side: 'BUY' | 'SELL';
  requestedSize: number;
  fairPrice: number;
}

function reject(signal: PaperSignal, cfg: Required<PaperExecutionConfig>, status: PaperExecutionAttempt['status'], reason: string): PaperExecutionAttempt {
  return {
    schemaVersion: 'hale-5m-paper-attempt-v0.1',
    attemptId: signal.attemptId,
    marketId: signal.marketId,
    tokenId: signal.tokenId,
    signalReceivedAtMs: signal.signalReceivedAtMs,
    hypotheticalArrivalAtMs: signal.signalReceivedAtMs + cfg.latencyMs,
    configuredLatencyMs: cfg.latencyMs,
    side: signal.side,
    requestedSize: signal.requestedSize,
    referencePrice: signal.fairPrice,
    status,
    reason,
  };
}

/**
 * Deterministic paper execution against the first REAL book observed at/after
 * hypothetical arrival. No live order path exists in this module.
 */
export function simulatePaperExecution(
  signal: PaperSignal,
  book: UnifiedMarketEvent<PolymarketBookPayload>,
  config: PaperExecutionConfig,
): PaperExecutionAttempt {
  const cfg: Required<PaperExecutionConfig> = {
    latencyMs: config.latencyMs,
    feeRate: config.feeRate ?? 0,
    minNetEdge: config.minNetEdge ?? 0,
    maxBookAgeMs: config.maxBookAgeMs ?? 1_000,
  };
  const arrival = signal.signalReceivedAtMs + cfg.latencyMs;
  if (book.clock.receivedAtMs < arrival) return reject(signal, cfg, 'PAPER_MISSED', 'BOOK_PRECEDES_HYPOTHETICAL_ARRIVAL');
  const sourceTs = book.clock.sourceTimestampMs;
  if (sourceTs === undefined || arrival - sourceTs > cfg.maxBookAgeMs) return reject(signal, cfg, 'REJECTED_STALE_BOOK', 'BOOK_STALE_AT_HYPOTHETICAL_ARRIVAL');

  const levels = signal.side === 'BUY' ? book.payload.asks : book.payload.bids;
  let remaining = signal.requestedSize;
  let notional = 0;
  let filled = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.size);
    notional += take * level.price;
    filled += take;
    remaining -= take;
  }
  if (filled < signal.requestedSize || filled <= 0) return reject(signal, cfg, 'REJECTED_NO_DEPTH', 'INSUFFICIENT_EXECUTABLE_DEPTH');

  const executablePrice = notional / filled;
  const grossEdge = signal.side === 'BUY'
    ? signal.fairPrice - executablePrice
    : executablePrice - signal.fairPrice;
  const estimatedFees = executablePrice * filled * cfg.feeRate;
  const feePerUnit = estimatedFees / filled;
  const netEdge = grossEdge - feePerUnit;
  if (netEdge < cfg.minNetEdge) {
    return {
      ...reject(signal, cfg, 'REJECTED_NO_EDGE', 'NET_EDGE_BELOW_THRESHOLD'),
      executablePrice, executableSize: filled, estimatedFees,
      estimatedSlippage: Math.abs(executablePrice - levels[0].price),
      grossEdge, netEdge,
    };
  }

  return {
    ...reject(signal, cfg, 'PAPER_FILLED', 'PAPER_FILL_AT_OR_AFTER_CONFIGURED_ARRIVAL'),
    executablePrice, executableSize: filled, estimatedFees,
    estimatedSlippage: Math.abs(executablePrice - levels[0].price),
    grossEdge, netEdge,
  };
}
