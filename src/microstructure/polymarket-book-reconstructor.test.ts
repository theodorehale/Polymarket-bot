import { describe, expect, it } from 'vitest';
import { PolymarketBookReconstructor } from './polymarket-book-reconstructor.js';

describe('PolymarketBookReconstructor', () => {
  it('applies BUY changes to bids and SELL changes to asks', () => {
    const r = new PolymarketBookReconstructor();
    r.applySnapshot({
      assetId: 'token',
      bids: [{ price: 0.4, size: 10 }],
      asks: [{ price: 0.6, size: 10 }],
    });

    expect(r.applyPriceChange({
      assetId: 'token',
      price: 0.45,
      size: 20,
      side: 'BUY',
      reportedBestBid: 0.45,
      reportedBestAsk: 0.6,
    }).matchesReportedBbo).toBe(true);

    expect(r.applyPriceChange({
      assetId: 'token',
      price: 0.55,
      size: 15,
      side: 'SELL',
      reportedBestBid: 0.45,
      reportedBestAsk: 0.55,
    }).matchesReportedBbo).toBe(true);
  });

  it('removes levels on size zero and uses 0/1 sentinels for empty sides', () => {
    const r = new PolymarketBookReconstructor();
    r.applySnapshot({
      assetId: 'token',
      bids: [{ price: 0.4, size: 10 }],
      asks: [{ price: 0.6, size: 10 }],
    });

    const bidRemoved = r.applyPriceChange({
      assetId: 'token',
      price: 0.4,
      size: 0,
      side: 'BUY',
      reportedBestBid: 0,
      reportedBestAsk: 0.6,
    });
    expect(bidRemoved).toMatchObject({ bestBid: 0, bestAsk: 0.6, matchesReportedBbo: true });

    const askRemoved = r.applyPriceChange({
      assetId: 'token',
      price: 0.6,
      size: 0,
      side: 'SELL',
      reportedBestBid: 0,
      reportedBestAsk: 1,
    });
    expect(askRemoved).toMatchObject({ bestBid: 0, bestAsk: 1, matchesReportedBbo: true });
  });

  it('flags reconstructed BBO disagreement instead of repairing it', () => {
    const r = new PolymarketBookReconstructor();
    r.applySnapshot({
      assetId: 'token',
      bids: [{ price: 0.4, size: 10 }],
      asks: [{ price: 0.6, size: 10 }],
    });

    const result = r.applyPriceChange({
      assetId: 'token',
      price: 0.45,
      size: 20,
      side: 'BUY',
      reportedBestBid: 0.44,
      reportedBestAsk: 0.6,
    });
    expect(result.matchesReportedBbo).toBe(false);
    expect(result.bestBid).toBe(0.45);
  });

  it('fails closed without an initial full snapshot', () => {
    const r = new PolymarketBookReconstructor();
    expect(() => r.applyPriceChange({
      assetId: 'token',
      price: 0.45,
      size: 20,
      side: 'BUY',
      reportedBestBid: 0.45,
      reportedBestAsk: 0.6,
    })).toThrow('MISSING_INITIAL_BOOK_SNAPSHOT');
  });

  it('fails closed on malformed price or size', () => {
    const r = new PolymarketBookReconstructor();
    r.applySnapshot({
      assetId: 'token',
      bids: [{ price: 0.4, size: 10 }],
      asks: [{ price: 0.6, size: 10 }],
    });
    expect(() => r.applyPriceChange({
      assetId: 'token',
      price: 1.2,
      size: 20,
      side: 'BUY',
      reportedBestBid: 0.4,
      reportedBestAsk: 0.6,
    })).toThrow('INVALID_PRICE_CHANGE_LEVEL');
  });
});
