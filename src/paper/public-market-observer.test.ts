import { describe, expect, it } from 'vitest';
import { observePublicMarket } from './public-market-observer.js';

const markets = (yesAsk: number, noAsk: number, ts: number) => ({
  resolveMarketTokens: async () => ({
    primaryTokenId: 'YES', secondaryTokenId: 'NO',
    outcomes: ['Yes','No'] as [string,string], primaryOutcome: 'Yes', secondaryOutcome: 'No'
  }),
  getTokenOrderbook: async (id: string) => ({
    tokenId: id, assetId: id, bids: [{ price: 0.3, size: 100 }],
    asks: [{ price: id === 'YES' ? yesAsk : noAsk, size: 100 }], timestamp: ts,
  }),
});

const config = {
  type: 'long' as const,
  targetPairShares: 10,
  yesFee: { status: 'known' as const, kind: 'zero' as const },
  noFee: { status: 'known' as const, kind: 'zero' as const },
  costs: { expectedGasUsd: 0, worstCaseGasUsd: 0 },
  maxBookAgeMs: 1000,
  maxBookSkewMs: 250,
  maxAdverseSlippageBps: 0,
};

describe('observePublicMarket', () => {
  it('marks a genuinely executable public-book quote as paper-only', async () => {
    const now = 10_000;
    const r = await observePublicMarket(markets(0.44, 0.53, now), 'c1', config, now);
    expect(r.mode).toBe('PAPER_ONLY');
    expect(r.status).toBe('PAPER_EXECUTABLE');
    expect(r.result.quote.safeToExecute).toBe(true);
  });

  it('records rejection reasons instead of pretending an opportunity exists', async () => {
    const now = 10_000;
    const r = await observePublicMarket(markets(0.6, 0.6, now), 'c2', config, now);
    expect(r.status).toBe('REJECTED');
    expect(r.result.quote.safeToExecute).toBe(false);
    expect(r.rejectionReasons.length).toBeGreaterThan(0);
  });

  it('rejects stale public books', async () => {
    const now = 10_000;
    const r = await observePublicMarket(markets(0.44, 0.53, 1_000), 'c3', config, now);
    expect(r.status).toBe('REJECTED');
    expect(r.rejectionReasons).toContain('YES_BOOK_STALE');
    expect(r.rejectionReasons).toContain('NO_BOOK_STALE');
  });
});
