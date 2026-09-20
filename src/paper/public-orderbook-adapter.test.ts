import { describe, expect, it } from 'vitest';
import { fetchPublicBinaryBooks } from './public-orderbook-adapter.js';

describe('fetchPublicBinaryBooks', () => {
  it('normalizes public books without any execution dependency', async () => {
    const markets = {
      resolveMarketTokens: async () => ({
        primaryTokenId: 'YES', secondaryTokenId: 'NO',
        outcomes: ['Yes','No'] as [string,string], primaryOutcome: 'Yes', secondaryOutcome: 'No'
      }),
      getTokenOrderbook: async (tokenId: string) => ({
        tokenId, assetId: tokenId,
        bids: [{ price: 0.4, size: 10 }],
        asks: [{ price: 0.5, size: 20 }],
        timestamp: 1234,
      }),
    };
    const r = await fetchPublicBinaryBooks(markets as any, 'condition');
    expect(r.yesTokenId).toBe('YES');
    expect(r.noTokenId).toBe('NO');
    expect(r.yesBook.asks[0]).toEqual({ price: 0.5, size: 20 });
    expect(r.yesBook.timestampMs).toBe(1234);
  });

  it('preserves malformed venue prices for downstream fail-closed rejection', async () => {
    const markets = {
      resolveMarketTokens: async () => ({
        primaryTokenId: 'YES', secondaryTokenId: 'NO',
        outcomes: ['Yes','No'] as [string,string], primaryOutcome: 'Yes', secondaryOutcome: 'No'
      }),
      getTokenOrderbook: async (tokenId: string) => ({
        tokenId, assetId: tokenId, bids: [], asks: [{ price: 1.2, size: 5 }], timestamp: 1234,
      }),
    };
    const r = await fetchPublicBinaryBooks(markets as any, 'condition');
    expect(r.yesBook.asks[0].price).toBe(1.2);
  });

  it('fails closed when binary tokens cannot be resolved', async () => {
    const markets = {
      resolveMarketTokens: async () => null,
      getTokenOrderbook: async () => { throw new Error('must not fetch'); },
    };
    await expect(fetchPublicBinaryBooks(markets as any, 'condition'))
      .rejects.toThrow('PUBLIC_MARKET_TOKENS_UNAVAILABLE');
  });
});
