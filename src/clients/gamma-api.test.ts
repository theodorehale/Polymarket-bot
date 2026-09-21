import { afterEach, describe, expect, it, vi } from 'vitest';
import { GammaApiClient } from './gamma-api.js';
import { RateLimiter } from '../core/rate-limiter.js';
import { Cache } from '../core/cache.js';
import { LegacyCacheWrapper } from '../core/unified-cache.js';

function client() {
  return new GammaApiClient(new RateLimiter(), new LegacyCacheWrapper(new Cache()));
}

afterEach(() => vi.unstubAllGlobals());

describe('GammaApiClient external-input boundary', () => {
  it('fails closed when markets response is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ markets: [] }), { status: 200 })));
    await expect(client().getMarkets()).rejects.toThrow('INVALID_GAMMA_MARKETS_RESPONSE_SHAPE');
  });

  it('fails closed when an array item is not a market object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([null]), { status: 200 })));
    await expect(client().getMarkets()).rejects.toThrow('INVALID_GAMMA_MARKET_SHAPE');
  });

  it('does not fabricate a current end date when endDate is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{
      id: '1', conditionId: '0xabc', slug: 'test', question: 'test?',
      outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]',
      active: true, closed: false
    }]), { status: 200 })));
    const [market] = await client().getMarkets();
    expect(Number.isNaN(market.endDate.getTime())).toBe(true);
  });
});
