import { describe, expect, it } from 'vitest';
import { evaluatePolymarketBookEvidence } from './evidence-gate.js';
import type { PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

const NOW = 1_800_000_000_000;

function bookEvent(
  payload: PolymarketBookPayload,
  overrides: Partial<UnifiedMarketEvent<PolymarketBookPayload>> = {},
): UnifiedMarketEvent<PolymarketBookPayload> {
  return {
    schemaVersion: 'hale-5m-event-v0.1',
    source: 'polymarket',
    kind: 'book_snapshot',
    instrument: 'btc-updown-5m',
    marketId: 'market-1',
    tokenId: 'token-1',
    clock: {
      sourceTimestampMs: NOW - 10,
      receivedAtMs: NOW,
      monotonicReceivedNs: '1',
    },
    payload,
    ...overrides,
  };
}

describe('evaluatePolymarketBookEvidence', () => {
  it('rejects the legacy synthetic 0.49/0.51 placeholder', () => {
    const result = evaluatePolymarketBookEvidence(
      bookEvent({
        bids: [{ price: 0.49, size: 100 }],
        asks: [{ price: 0.51, size: 100 }],
      }),
      NOW,
    );
    expect(result).toEqual({
      accepted: false,
      status: 'SYNTHETIC',
      reason: 'LEGACY_INITIAL_BOOK_PLACEHOLDER',
    });
  });

  it('rejects missing source provenance', () => {
    const event = bookEvent({
      bids: [{ price: 0.48, size: 20 }],
      asks: [{ price: 0.52, size: 30 }],
    });
    event.clock.sourceTimestampMs = undefined;
    expect(evaluatePolymarketBookEvidence(event, NOW).accepted).toBe(false);
  });

  it('rejects stale local observations', () => {
    const event = bookEvent({
      bids: [{ price: 0.48, size: 20 }],
      asks: [{ price: 0.52, size: 30 }],
    });
    event.clock.receivedAtMs = NOW - 2_000;
    const result = evaluatePolymarketBookEvidence(event, NOW, { maxAgeMs: 1_000 });
    expect(result.status).toBe('STALE');
  });

  it('rejects empty books', () => {
    const result = evaluatePolymarketBookEvidence(
      bookEvent({ bids: [], asks: [{ price: 0.52, size: 30 }] }),
      NOW,
    );
    expect(result.status).toBe('INVALID');
  });

  it('rejects crossed books', () => {
    const result = evaluatePolymarketBookEvidence(
      bookEvent({
        bids: [{ price: 0.53, size: 20 }],
        asks: [{ price: 0.52, size: 30 }],
      }),
      NOW,
    );
    expect(result.reason).toBe('CROSSED_OR_LOCKED_BOOK');
  });

  it('accepts a fresh, ordered, non-synthetic book with source provenance', () => {
    const result = evaluatePolymarketBookEvidence(
      bookEvent({
        bids: [
          { price: 0.48, size: 20 },
          { price: 0.47, size: 40 },
        ],
        asks: [
          { price: 0.52, size: 30 },
          { price: 0.53, size: 50 },
        ],
      }),
      NOW,
    );
    expect(result).toEqual({
      accepted: true,
      status: 'REAL',
      reason: 'ACCEPTED_REAL_BOOK_EVIDENCE',
    });
  });
});
