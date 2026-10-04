import type { BookLevel, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

export type EvidenceStatus = 'REAL' | 'SYNTHETIC' | 'STALE' | 'INVALID';

export interface EvidenceGateConfig {
  maxAgeMs?: number;
  futureToleranceMs?: number;
}

export interface EvidenceDecision {
  accepted: boolean;
  status: EvidenceStatus;
  reason: string;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validLevels(levels: BookLevel[], side: 'bid' | 'ask'): boolean {
  if (!Array.isArray(levels) || levels.length === 0) return false;

  for (const level of levels) {
    if (!finitePositive(level.price) || !finitePositive(level.size)) return false;
    if (level.price >= 1) return false;
  }

  // Fail closed on obviously malformed ordering.
  for (let i = 1; i < levels.length; i += 1) {
    if (side === 'bid' && levels[i].price > levels[i - 1].price) return false;
    if (side === 'ask' && levels[i].price < levels[i - 1].price) return false;
  }

  return true;
}

/**
 * Scientific evidence gate for Polymarket orderbooks.
 *
 * This deliberately rejects uncertain provenance instead of trying to repair it.
 * Rejected evidence must never reach lead/lag, paper-fill, or P&L calculations.
 */
export function evaluatePolymarketBookEvidence(
  event: UnifiedMarketEvent<PolymarketBookPayload>,
  nowMs = Date.now(),
  config: EvidenceGateConfig = {},
): EvidenceDecision {
  const maxAgeMs = config.maxAgeMs ?? 1_000;
  const futureToleranceMs = config.futureToleranceMs ?? 250;

  if (event.source !== 'polymarket' || event.kind !== 'book_snapshot') {
    return { accepted: false, status: 'INVALID', reason: 'NOT_POLYMARKET_BOOK_SNAPSHOT' };
  }

  const sourceTs = event.clock.sourceTimestampMs;
  if (sourceTs === undefined || !Number.isFinite(sourceTs)) {
    return { accepted: false, status: 'INVALID', reason: 'MISSING_SOURCE_TIMESTAMP' };
  }

  if (!Number.isFinite(event.clock.receivedAtMs)) {
    return { accepted: false, status: 'INVALID', reason: 'INVALID_RECEIVE_TIMESTAMP' };
  }

  if (sourceTs > nowMs + futureToleranceMs) {
    return { accepted: false, status: 'INVALID', reason: 'SOURCE_TIMESTAMP_IN_FUTURE' };
  }

  if (nowMs - event.clock.receivedAtMs > maxAgeMs) {
    return { accepted: false, status: 'STALE', reason: 'LOCAL_RECEIVE_TIME_STALE' };
  }

  if (event.clock.receivedAtMs < sourceTs - futureToleranceMs) {
    return { accepted: false, status: 'INVALID', reason: 'RECEIVED_BEFORE_SOURCE_TIMESTAMP' };
  }

  const { bids, asks } = event.payload;
  if (!validLevels(bids, 'bid') || !validLevels(asks, 'ask')) {
    return { accepted: false, status: 'INVALID', reason: 'EMPTY_OR_MALFORMED_BOOK' };
  }

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  if (bestBid >= bestAsk) {
    return { accepted: false, status: 'INVALID', reason: 'CROSSED_OR_LOCKED_BOOK' };
  }

  // Known legacy placeholder from RealtimeServiceV2. Never treat it as market evidence.
  if (
    bids.length === 1 &&
    asks.length === 1 &&
    bestBid === 0.49 &&
    bestAsk === 0.51 &&
    bids[0].size === 100 &&
    asks[0].size === 100
  ) {
    return { accepted: false, status: 'SYNTHETIC', reason: 'LEGACY_INITIAL_BOOK_PLACEHOLDER' };
  }

  return { accepted: true, status: 'REAL', reason: 'ACCEPTED_REAL_BOOK_EVIDENCE' };
}
