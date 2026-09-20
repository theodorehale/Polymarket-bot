import { describe, expect, it } from 'vitest';
import { samplePublicMarkets } from './public-market-sampler.js';

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

describe('samplePublicMarkets', () => {
  it('collects observations, errors, stats and JSONL without execution capability', async () => {
    let tick = 10_000;
    const markets = {
      resolveMarketTokens: async (conditionId: string) => conditionId === 'missing' ? null : ({
        primaryTokenId: conditionId + '-YES',
        secondaryTokenId: conditionId + '-NO',
        outcomes: ['Yes','No'] as [string,string],
        primaryOutcome: 'Yes',
        secondaryOutcome: 'No',
      }),
      getTokenOrderbook: async (tokenId: string) => ({
        tokenId,
        assetId: tokenId,
        bids: [{ price: 0.3, size: 100 }],
        asks: [{ price: tokenId.endsWith('-YES') ? 0.44 : 0.53, size: 100 }],
        timestamp: 10_000,
      }),
    };

    const out = await samplePublicMarkets(
      markets as any,
      ['a', 'missing', 'b'],
      config,
      () => tick++
    );

    expect(out.mode).toBe('PAPER_ONLY');
    expect(out.requestedMarkets).toBe(3);
    expect(out.successfulObservations).toBe(2);
    expect(out.failedObservations).toBe(1);
    expect(out.stats.total).toBe(2);
    expect(out.stats.paperExecutable).toBe(2);
    expect(out.errors[0]).toEqual({
      conditionId: 'missing',
      error: 'PUBLIC_MARKET_TOKENS_UNAVAILABLE',
    });
    expect(out.jsonl).toHaveLength(2);
    const serialized = JSON.stringify(out).toLowerCase();
    expect(serialized).not.toContain('privatekey');
    expect(serialized).not.toContain('signer');
    expect(serialized).not.toContain('submitorder');
  });
});
