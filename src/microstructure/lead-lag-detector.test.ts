import { describe, expect, it } from 'vitest';
import { LeadLagDetector } from './lead-lag-detector.js';
import type { BinanceTradePayload, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

const monoNs = (ms: number) => String(Math.round(ms * 1_000_000));

function trade(
  wallMs: number,
  price: number,
  monotonicMs = wallMs,
): UnifiedMarketEvent<BinanceTradePayload> {
  return {
    schemaVersion: 'hale-5m-event-v0.1',
    source: 'binance',
    kind: 'trade',
    instrument: 'BTCUSDT',
    clock: {
      sourceTimestampMs: wallMs,
      receivedAtMs: wallMs,
      monotonicReceivedNs: monoNs(monotonicMs),
    },
    payload: {
      symbol: 'BTCUSDT',
      tradeId: wallMs,
      price,
      quantity: 1,
      buyerIsMaker: false,
    },
  };
}

function book(
  wallMs: number,
  mid: number,
  side: 'UP' | 'DOWN' = 'UP',
  tokenId = side === 'UP' ? 'up-token' : 'down-token',
  monotonicMs = wallMs,
): UnifiedMarketEvent<PolymarketBookPayload> {
  return {
    schemaVersion: 'hale-5m-event-v0.1',
    source: 'polymarket',
    kind: 'book_snapshot',
    instrument: 'm1',
    marketId: 'm1',
    tokenId,
    clock: {
      sourceTimestampMs: wallMs,
      receivedAtMs: wallMs,
      monotonicReceivedNs: monoNs(monotonicMs),
    },
    payload: {
      side,
      bids: [{ price: mid - 0.01, size: 90 }],
      asks: [{ price: mid + 0.01, size: 90 }],
    },
  };
}

describe('LeadLagDetector', () => {
  it('emits deterministic T0→T2 observation using monotonic latency', () => {
    const d = new LeadLagDetector({
      shockWindowMs: 250,
      minAbsoluteMoveBps: 2,
      minPolyMidMove: 0.005,
    });
    d.onPolymarket(book(900, 0.50));
    d.onBinance(trade(1000, 100_000));
    d.onBinance(trade(1100, 100_030));
    expect(d.onPolymarket(book(1180, 0.51))).toMatchObject([
      {
        marketId: 'm1',
        tokenId: 'up-token',
        outcomeDirection: 'UP',
        reactionStatus: 'RESPONDED',
        t0SpotShockMs: 1100,
        t2PolyRepriceStartMs: 1180,
        spotToPolyRepriceMs: 80,
      },
    ]);
  });

  it('does not let wall-clock reversal corrupt cross-source latency', () => {
    const d = new LeadLagDetector({
      shockWindowMs: 250,
      minAbsoluteMoveBps: 2,
      minPolyMidMove: 0.005,
    });
    d.onPolymarket(book(9_000, 0.50, 'UP', 'up-token', 900));
    d.onBinance(trade(10_000, 100_000, 1000));
    d.onBinance(trade(20_000, 100_030, 1100));

    const response = d.onPolymarket(
      book(1_000, 0.51, 'UP', 'up-token', 1180),
    );
    expect(response).toMatchObject([
      {
        reactionStatus: 'RESPONDED',
        t0SpotShockMs: 20_000,
        t2PolyRepriceStartMs: 1_000,
        spotToPolyRepriceMs: 80,
      },
    ]);
  });

  it('maps a downward BTC shock only to the DOWN buy outcome', () => {
    const d = new LeadLagDetector({
      shockWindowMs: 250,
      minAbsoluteMoveBps: 2,
      minPolyMidMove: 0.005,
    });
    d.onPolymarket(book(900, 0.50, 'UP', 'up-token'));
    d.onPolymarket(book(901, 0.50, 'DOWN', 'down-token'));
    d.onBinance(trade(1000, 100_000));
    d.onBinance(trade(1100, 99_970));

    expect(d.onPolymarket(book(1180, 0.55, 'UP', 'up-token'))).toHaveLength(0);
    expect(d.onPolymarket(book(1190, 0.51, 'DOWN', 'down-token'))).toMatchObject([
      {
        tokenId: 'down-token',
        outcomeDirection: 'DOWN',
        reactionStatus: 'RESPONDED',
        spotToPolyRepriceMs: 90,
      },
    ]);
  });

  it('does not emit a response when the mapped outcome moves the wrong way', () => {
    const d = new LeadLagDetector();
    d.onPolymarket(book(900, 0.50));
    d.onBinance(trade(1000, 100_000));
    d.onBinance(trade(1100, 100_030));
    expect(d.onPolymarket(book(1180, 0.49))).toHaveLength(0);
  });

  it('records an explicit timeout exactly once instead of silently dropping a shock', () => {
    const d = new LeadLagDetector({ maxReactionMs: 500 });
    d.onPolymarket(book(900, 0.50));
    d.onBinance(trade(1000, 100_000));
    d.onBinance(trade(1100, 100_030));

    const timeout = d.flushExpired(monoNs(1601), 1601);
    expect(timeout).toMatchObject([
      {
        tokenId: 'up-token',
        outcomeDirection: 'UP',
        reactionStatus: 'TIMEOUT',
        t0SpotShockMs: 1100,
      },
    ]);
    expect(d.flushExpired(monoNs(1800), 1800)).toHaveLength(0);
  });
});
