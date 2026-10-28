import type { BookLevel, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';
import { evaluatePolymarketBookEvidence, type EvidenceDecision } from './evidence-gate.js';

export interface RtdsMessage<T = unknown> {
  topic: string;
  type?: string;
  timestamp?: number | string;
  payload?: T;
  data?: T;
}

export interface RawClobBook {
  market?: string;
  condition_id?: string;
  asset_id?: string;
  token_id?: string;
  hash?: string;
  bids?: Array<{ price: string | number; size: string | number }>;
  asks?: Array<{ price: string | number; size: string | number }>;
}

export interface ParsedClobMarketEvidence {
  event?: UnifiedMarketEvent<PolymarketBookPayload>;
  evidence: EvidenceDecision;
}

function parseTimestamp(value: number | string | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function levels(raw: RawClobBook['bids']): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(x => ({ price: Number(x.price), size: Number(x.size) }));
}

/**
 * Parse a raw Polymarket RTDS clob_market message without inventing provenance.
 * The RTDS top-level timestamp is preserved as the source timestamp.
 * Missing/invalid timestamps fail closed through the evidence gate.
 */
export function parseClobMarketMessage(
  message: RtdsMessage<RawClobBook>,
  receivedAtMs = Date.now(),
  monotonicReceivedNs = process.hrtime.bigint().toString(),
): ParsedClobMarketEvidence {
  if (message.topic !== 'clob_market') {
    return {
      evidence: { accepted: false, status: 'INVALID', reason: 'NOT_CLOB_MARKET_TOPIC' },
    };
  }

  const raw = (message.payload ?? message.data) as RawClobBook | undefined;
  if (!raw || typeof raw !== 'object') {
    return {
      evidence: { accepted: false, status: 'INVALID', reason: 'MISSING_CLOB_PAYLOAD' },
    };
  }

  const marketId = raw.market ?? raw.condition_id;
  const tokenId = raw.token_id ?? raw.asset_id;
  if (!marketId || !tokenId) {
    return {
      evidence: { accepted: false, status: 'INVALID', reason: 'MISSING_MARKET_OR_TOKEN_ID' },
    };
  }

  const event: UnifiedMarketEvent<PolymarketBookPayload> = {
    schemaVersion: 'hale-5m-event-v0.1',
    source: 'polymarket',
    kind: 'book_snapshot',
    instrument: marketId,
    marketId,
    tokenId,
    clock: {
      sourceTimestampMs: parseTimestamp(message.timestamp),
      receivedAtMs,
      monotonicReceivedNs,
    },
    sequence: raw.hash || undefined,
    payload: {
      bids: levels(raw.bids),
      asks: levels(raw.asks),
    },
  };

  return {
    event,
    evidence: evaluatePolymarketBookEvidence(event, receivedAtMs),
  };
}
