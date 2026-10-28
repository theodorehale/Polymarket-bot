import type { OrderbookSnapshot } from '../services/realtime-service-v2.js';
import type { PolymarketBookPayload, UnifiedMarketEvent } from './types.js';
import { evaluatePolymarketBookEvidence, type EvidenceDecision } from './evidence-gate.js';

export interface AdaptedPolymarketBook {
  event: UnifiedMarketEvent<PolymarketBookPayload>;
  evidence: EvidenceDecision;
}

/**
 * Adapter boundary between legacy realtime plumbing and the scientific stream.
 *
 * Important: legacy service timestamps may be local parse/receive timestamps.
 * Until a genuine upstream source timestamp is proven, callers must pass it
 * explicitly. Missing provenance fails closed in the evidence gate.
 */
export function adaptPolymarketBook(
  book: OrderbookSnapshot,
  sourceTimestampMs?: number,
  receivedAtMs = Date.now(),
): AdaptedPolymarketBook {
  const event: UnifiedMarketEvent<PolymarketBookPayload> = {
    schemaVersion: 'hale-5m-event-v0.1',
    source: 'polymarket',
    kind: 'book_snapshot',
    instrument: book.market || book.assetId,
    marketId: book.market || undefined,
    tokenId: book.tokenId || book.assetId,
    clock: {
      sourceTimestampMs,
      receivedAtMs,
      monotonicReceivedNs: process.hrtime.bigint().toString(),
    },
    sequence: book.hash || undefined,
    payload: {
      bids: book.bids.map(level => ({ price: Number(level.price), size: Number(level.size) })),
      asks: book.asks.map(level => ({ price: Number(level.price), size: Number(level.size) })),
    },
  };

  return {
    event,
    evidence: evaluatePolymarketBookEvidence(event, receivedAtMs),
  };
}
