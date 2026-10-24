import { describe, expect, it } from 'vitest';
import { LeadLagDetector } from './lead-lag-detector.js';
import type { BinanceTradePayload, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

function trade(ts: number, price: number): UnifiedMarketEvent<BinanceTradePayload> {
  return {
    schemaVersion: 'hale-5m-event-v0.1', source: 'binance', kind: 'trade', instrument: 'BTCUSDT',
    clock: { sourceTimestampMs: ts, receivedAtMs: ts, monotonicReceivedNs: String(ts) },
    payload: { symbol: 'BTCUSDT', tradeId: ts, price, quantity: 1, buyerIsMaker: false },
  };
}

function book(ts: number, mid: number): UnifiedMarketEvent<PolymarketBookPayload> {
  return {
    schemaVersion: 'hale-5m-event-v0.1', source: 'polymarket', kind: 'book_snapshot',
    instrument: 'm1', marketId: 'm1', tokenId: 't1',
    clock: { sourceTimestampMs: ts, receivedAtMs: ts, monotonicReceivedNs: String(ts) },
    payload: {
      bids: [{ price: mid - 0.01, size: 100 }],
      asks: [{ price: mid + 0.01, size: 100 }],
    },
  };
}

describe('LeadLagDetector', () => {
  it('emits deterministic T0→T2 observation for same-direction repricing', () => {
    const d = new LeadLagDetector({ shockWindowMs: 250, minAbsoluteMoveBps: 2, minPolyMidMove: 0.005 });
    d.onPolymarket(book(900, 0.50));
    d.onBinance(trade(1000, 100_000));
    d.onBinance(trade(1100, 100_030));
    expect(d.onPolymarket(book(1180, 0.51))).toMatchObject([
      { marketId: 'm1', t0SpotShockMs: 1100, t2PolyRepriceStartMs: 1180, spotToPolyRepriceMs: 80 },
    ]);
  });

  it('does not emit when Polymarket moves opposite the spot shock', () => {
    const d = new LeadLagDetector();
    d.onPolymarket(book(900, 0.50));
    d.onBinance(trade(1000, 100_000));
    d.onBinance(trade(1100, 100_030));
    expect(d.onPolymarket(book(1180, 0.49))).toHaveLength(0);
  });

  it('expires reactions beyond maxReactionMs', () => {
    const d = new LeadLagDetector({ maxReactionMs: 500 });
    d.onPolymarket(book(900, 0.50));
    d.onBinance(trade(1000, 100_000));
    d.onBinance(trade(1100, 100_030));
    expect(d.onPolymarket(book(1700, 0.51))).toHaveLength(0);
  });
});
