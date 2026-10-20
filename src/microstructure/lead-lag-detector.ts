import { evaluatePolymarketBookEvidence } from './evidence-gate.js';
import { createHash } from 'node:crypto';
import type {
  BinanceTradePayload,
  LeadLagObservation,
  PolymarketBookPayload,
  UnifiedMarketEvent,
} from './types.js';

export interface LeadLagDetectorConfig {
  shockWindowMs?: number;
  minAbsoluteMoveBps?: number;
  maxReactionMs?: number;
  minPolyMidMove?: number;
}

type SpotPoint = {
  receivedAtMs: number;
  monotonicNs: bigint;
  price: number;
};

type LastPolyPoint = {
  mid: number;
  marketId: string;
  tokenId: string;
  side: 'UP' | 'DOWN';
  receivedAtMs: number;
  monotonicNs: bigint;
};

type PendingShock = {
  id: string;
  t0ReceivedAtMs: number;
  t0MonotonicNs: bigint;
  direction: 1 | -1;
  baselinePolyMid: number;
  marketId: string;
  tokenId: string;
  outcomeDirection: 'UP' | 'DOWN';
};

function mid(event: UnifiedMarketEvent<PolymarketBookPayload>): number | undefined {
  const bid = event.payload.bids[0]?.price;
  const ask = event.payload.asks[0]?.price;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return undefined;
  return (bid + ask) / 2;
}

function parseMonotonicNs(value: string): bigint | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function durationNs(ms: number): bigint {
  return BigInt(Math.round(ms * 1_000_000));
}

function elapsedMs(startNs: bigint, endNs: bigint): number | undefined {
  if (endNs < startNs) return undefined;
  const value = Number(endNs - startNs) / 1_000_000;
  return Number.isFinite(value) ? value : undefined;
}

function idFor(monotonicNs: bigint, direction: number, price: number, tokenId: string): string {
  return createHash('sha256')
    .update(`${monotonicNs}|${direction}|${price}|${tokenId}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Deterministic V0.1 detector.
 *
 * Scientific clock rule:
 * - source timestamps are provenance only;
 * - wall-clock receive timestamps are human-readable labels;
 * - cross-source ordering/latency uses the shared process monotonic clock.
 *
 * Strategy mapping rule:
 * - upward BTC shock -> BUY UP candidate only;
 * - downward BTC shock -> BUY DOWN candidate only.
 * The opposite token is not counted as an independent opportunity.
 *
 * Every created shock eventually becomes RESPONDED or TIMEOUT. Timeouts are
 * explicit observations, never silently dropped.
 */
export class LeadLagDetector {
  private readonly cfg: Required<LeadLagDetectorConfig>;
  private spot: SpotPoint[] = [];
  private lastPolyMid = new Map<string, LastPolyPoint>();
  private pending: PendingShock[] = [];
  private cooldownUntilNs = 0n;

  constructor(config: LeadLagDetectorConfig = {}) {
    this.cfg = {
      shockWindowMs: config.shockWindowMs ?? 250,
      minAbsoluteMoveBps: config.minAbsoluteMoveBps ?? 2,
      maxReactionMs: config.maxReactionMs ?? 2_000,
      minPolyMidMove: config.minPolyMidMove ?? 0.005,
    };
  }

  private expirePending(nowMonotonicNs: bigint, nowReceivedAtMs: number): LeadLagObservation[] {
    const completed: LeadLagObservation[] = [];
    const stillPending: PendingShock[] = [];
    const maxReactionNs = durationNs(this.cfg.maxReactionMs);

    for (const shock of this.pending) {
      if (nowMonotonicNs < shock.t0MonotonicNs) {
        stillPending.push(shock);
        continue;
      }
      if (nowMonotonicNs - shock.t0MonotonicNs <= maxReactionNs) {
        stillPending.push(shock);
        continue;
      }

      completed.push({
        schemaVersion: 'hale-5m-leadlag-v0.1',
        observationId: shock.id,
        marketId: shock.marketId,
        tokenId: shock.tokenId,
        outcomeDirection: shock.outcomeDirection,
        spotInstrument: 'BTCUSDT',
        reactionStatus: 'TIMEOUT',
        t0SpotShockMs: shock.t0ReceivedAtMs,
        t0SpotShockMonotonicNs: shock.t0MonotonicNs.toString(),
        timeoutAtMs: nowReceivedAtMs,
        timeoutAtMonotonicNs: nowMonotonicNs.toString(),
      });
    }

    this.pending = stillPending;
    return completed;
  }

  onBinance(event: UnifiedMarketEvent<BinanceTradePayload>): LeadLagObservation[] {
    const monotonicNs = parseMonotonicNs(event.clock.monotonicReceivedNs);
    const ts = event.clock.receivedAtMs;
    const price = event.payload.price;
    if (monotonicNs === undefined || !Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) return [];

    const completed = this.expirePending(monotonicNs, ts);
    const lastSpot = this.spot.at(-1);
    if (lastSpot && monotonicNs < lastSpot.monotonicNs) return completed;

    this.spot.push({ receivedAtMs: ts, monotonicNs, price });
    const shockWindowNs = durationNs(this.cfg.shockWindowMs);
    this.spot = this.spot.filter(p =>
      monotonicNs >= p.monotonicNs && monotonicNs - p.monotonicNs <= shockWindowNs
    );

    const baseline = this.spot[0];
    if (!baseline || baseline.price === price || monotonicNs < this.cooldownUntilNs) return completed;

    const moveBps = ((price - baseline.price) / baseline.price) * 10_000;
    if (!Number.isFinite(moveBps) || Math.abs(moveBps) < this.cfg.minAbsoluteMoveBps) return completed;

    const direction: 1 | -1 = moveBps > 0 ? 1 : -1;
    const targetOutcome: 'UP' | 'DOWN' = direction > 0 ? 'UP' : 'DOWN';
    const maxReactionNs = durationNs(this.cfg.maxReactionMs);

    for (const point of this.lastPolyMid.values()) {
      if (point.side !== targetOutcome) continue;
      if (point.monotonicNs > monotonicNs) continue;
      if (monotonicNs - point.monotonicNs > maxReactionNs) continue;

      this.pending.push({
        id: idFor(monotonicNs, direction, price, point.tokenId),
        t0ReceivedAtMs: ts,
        t0MonotonicNs: monotonicNs,
        direction,
        baselinePolyMid: point.mid,
        marketId: point.marketId,
        tokenId: point.tokenId,
        outcomeDirection: targetOutcome,
      });
    }

    this.cooldownUntilNs = monotonicNs + shockWindowNs;
    return completed;
  }

  onPolymarket(
    event: UnifiedMarketEvent<PolymarketBookPayload>,
  ): LeadLagObservation[] {
    const monotonicNs = parseMonotonicNs(event.clock.monotonicReceivedNs);
    const ts = event.clock.receivedAtMs;
    if (monotonicNs === undefined || !Number.isFinite(ts)) return [];

    const completed = this.expirePending(monotonicNs, ts);
    if (
      !event.marketId ||
      !event.tokenId ||
      !['UP', 'DOWN'].includes(event.payload.side ?? '') ||
      !evaluatePolymarketBookEvidence(event, ts).accepted
    ) return completed;

    const currentMid = mid(event);
    if (currentMid === undefined) return completed;

    const side = event.payload.side as 'UP' | 'DOWN';
    const key = event.marketId + '|' + event.tokenId;
    const prior = this.lastPolyMid.get(key);
    if (prior && prior.monotonicNs > monotonicNs) return completed;

    this.lastPolyMid.set(key, {
      mid: currentMid,
      marketId: event.marketId,
      tokenId: event.tokenId,
      side,
      receivedAtMs: ts,
      monotonicNs,
    });

    const stillPending: PendingShock[] = [];
    for (const shock of this.pending) {
      if (monotonicNs < shock.t0MonotonicNs) {
        stillPending.push(shock);
        continue;
      }
      if (shock.marketId !== event.marketId || shock.tokenId !== event.tokenId) {
        stillPending.push(shock);
        continue;
      }

      // For the mapped BUY outcome, a valid response is an increase in token mid.
      const reacted = currentMid - shock.baselinePolyMid >= this.cfg.minPolyMidMove;
      if (!reacted) {
        stillPending.push(shock);
        continue;
      }

      const responseMs = elapsedMs(shock.t0MonotonicNs, monotonicNs);
      if (responseMs === undefined) {
        stillPending.push(shock);
        continue;
      }

      completed.push({
        schemaVersion: 'hale-5m-leadlag-v0.1',
        observationId: shock.id,
        marketId: event.marketId,
        tokenId: event.tokenId,
        outcomeDirection: shock.outcomeDirection,
        spotInstrument: 'BTCUSDT',
        reactionStatus: 'RESPONDED',
        t0SpotShockMs: shock.t0ReceivedAtMs,
        t0SpotShockMonotonicNs: shock.t0MonotonicNs.toString(),
        t2PolyRepriceStartMs: ts,
        t2PolyRepriceStartMonotonicNs: monotonicNs.toString(),
        spotToPolyRepriceMs: responseMs,
      });
    }

    this.pending = stillPending;
    return completed;
  }

  flushExpired(monotonicReceivedNs: string, receivedAtMs: number): LeadLagObservation[] {
    const monotonicNs = parseMonotonicNs(monotonicReceivedNs);
    if (monotonicNs === undefined || !Number.isFinite(receivedAtMs)) return [];
    return this.expirePending(monotonicNs, receivedAtMs);
  }
}
