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

type SpotPoint = { ts: number; price: number };
type PendingShock = {
  id: string;
  t0: number;
  direction: 1 | -1;
  baselinePolyMid?: number;
  marketId?: string;
};

function mid(event: UnifiedMarketEvent<PolymarketBookPayload>): number | undefined {
  const bid = event.payload.bids[0]?.price;
  const ask = event.payload.asks[0]?.price;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return undefined;
  return (bid + ask) / 2;
}

function idFor(ts: number, direction: number, price: number): string {
  return createHash('sha256').update(`${ts}|${direction}|${price}`).digest('hex').slice(0, 24);
}

/**
 * Deterministic V0.1 detector:
 * - T0 = first Binance trade whose move vs the oldest point in shockWindow exceeds threshold.
 * - T2 = first accepted Polymarket mid-price move in the same direction after T0.
 * This intentionally does not infer fair value or fills yet.
 */
export class LeadLagDetector {
  private readonly cfg: Required<LeadLagDetectorConfig>;
  private spot: SpotPoint[] = [];
  private lastPolyMid?: number;
  private pending: PendingShock[] = [];
  private cooldownUntilMs = 0;

  constructor(config: LeadLagDetectorConfig = {}) {
    this.cfg = {
      shockWindowMs: config.shockWindowMs ?? 250,
      minAbsoluteMoveBps: config.minAbsoluteMoveBps ?? 2,
      maxReactionMs: config.maxReactionMs ?? 2_000,
      minPolyMidMove: config.minPolyMidMove ?? 0.005,
    };
  }

  onBinance(event: UnifiedMarketEvent<BinanceTradePayload>): void {
    const ts = event.clock.receivedAtMs;
    const price = event.payload.price;
    if (!Number.isFinite(price) || price <= 0) return;

    this.spot.push({ ts, price });
    this.spot = this.spot.filter(p => ts - p.ts <= this.cfg.shockWindowMs);
    const baseline = this.spot[0];
    if (!baseline || baseline.price === price || ts < this.cooldownUntilMs) return;

    const moveBps = ((price - baseline.price) / baseline.price) * 10_000;
    if (Math.abs(moveBps) < this.cfg.minAbsoluteMoveBps) return;

    const direction: 1 | -1 = moveBps > 0 ? 1 : -1;
    this.pending.push({
      id: idFor(ts, direction, price),
      t0: ts,
      direction,
      baselinePolyMid: this.lastPolyMid,
    });
    this.cooldownUntilMs = ts + this.cfg.shockWindowMs;
  }

  onPolymarket(
    event: UnifiedMarketEvent<PolymarketBookPayload>,
  ): LeadLagObservation[] {
    const ts = event.clock.receivedAtMs;
    const currentMid = mid(event);
    if (currentMid === undefined) return [];

    const previousMid = this.lastPolyMid;
    this.lastPolyMid = currentMid;

    const completed: LeadLagObservation[] = [];
    const stillPending: PendingShock[] = [];

    for (const shock of this.pending) {
      if (ts < shock.t0) {
        stillPending.push(shock);
        continue;
      }
      if (ts - shock.t0 > this.cfg.maxReactionMs) continue;

      const baseline = shock.baselinePolyMid ?? previousMid;
      if (baseline === undefined) {
        stillPending.push(shock);
        continue;
      }

      const delta = currentMid - baseline;
      const reacted =
        shock.direction > 0
          ? delta >= this.cfg.minPolyMidMove
          : delta <= -this.cfg.minPolyMidMove;

      if (!reacted) {
        stillPending.push(shock);
        continue;
      }

      completed.push({
        schemaVersion: 'hale-5m-leadlag-v0.1',
        observationId: shock.id,
        marketId: event.marketId ?? event.instrument,
        spotInstrument: 'BTCUSDT',
        t0SpotShockMs: shock.t0,
        t2PolyRepriceStartMs: ts,
        spotToPolyRepriceMs: ts - shock.t0,
      });
    }

    this.pending = stillPending;
    return completed;
  }
}
