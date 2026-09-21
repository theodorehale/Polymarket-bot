/**
 * Phase 4.1 Gamma -> CLOB semantic discovery probe.
 * Public reads only: no private key, wallet, signer, Jev, arbitrage calculation, or orders.
 */
import { GammaApiClient } from '../src/clients/gamma-api.js';
import { MarketService } from '../src/services/market-service.js';
import { RateLimiter } from '../src/core/rate-limiter.js';
import { Cache } from '../src/core/cache.js';
import { LegacyCacheWrapper } from '../src/core/unified-cache.js';
import { sanitizeExternalError } from '../src/research/security-boundary.js';
import { probePublicMarket } from '../src/paper/adversarial-public-data-probe.js';

async function main() {
  if (process.env.POLYMARKET_PRIVATE_KEY || process.env.PRIVATE_KEY) {
    throw new Error('PROBE_REFUSES_PRIVATE_KEY_ENVIRONMENT');
  }

  const rateLimiter = new RateLimiter();
  const cache = new LegacyCacheWrapper(new Cache());
  const gamma = new GammaApiClient(rateLimiter, cache);
  const clob = new MarketService(undefined, undefined, rateLimiter, cache, undefined);

  const gammaMarkets = await gamma.getMarkets({
    active: true,
    closed: false,
    order: 'volume24hr',
    ascending: false,
    limit: 10,
  });

  const candidates = gammaMarkets.filter(
    (m) =>
      Boolean(m.conditionId && m.slug && m.question) &&
      m.active === true &&
      m.closed === false &&
      Number.isFinite(m.endDate.getTime())
  );

  const semanticSamples = [];
  const verifiedConditionIds: string[] = [];
  for (const gammaMarket of candidates) {
    try {
      const clobMarket = await clob.getClobMarket(gammaMarket.conditionId);
      if (
        verifiedConditionIds.length < 5 &&
        clobMarket.conditionId === gammaMarket.conditionId &&
        clobMarket.active === true &&
        clobMarket.closed === false &&
        clobMarket.acceptingOrders === true &&
        clobMarket.tokens.length === 2
      ) verifiedConditionIds.push(gammaMarket.conditionId);
      semanticSamples.push({
        gamma: {
          conditionId: gammaMarket.conditionId,
          slug: gammaMarket.slug,
          question: gammaMarket.question,
          endDateIso: gammaMarket.endDate.toISOString(),
          active: gammaMarket.active,
          closed: gammaMarket.closed,
          outcomes: gammaMarket.outcomes,
        },
        clob: {
          conditionId: clobMarket.conditionId,
          slug: clobMarket.marketSlug,
          question: clobMarket.question,
          endDateIso: clobMarket.endDateIso,
          active: clobMarket.active,
          closed: clobMarket.closed,
          acceptingOrders: clobMarket.acceptingOrders,
          tokens: clobMarket.tokens.map((t) => ({ tokenId: t.tokenId, outcome: t.outcome })),
        },
        conditionIdMatches: clobMarket.conditionId === gammaMarket.conditionId,
      });
    } catch (error) {
      semanticSamples.push({
        gamma: {
          conditionId: gammaMarket.conditionId,
          slug: gammaMarket.slug,
          question: gammaMarket.question,
          endDateIso: gammaMarket.endDate.toISOString(),
          active: gammaMarket.active,
          closed: gammaMarket.closed,
          outcomes: gammaMarket.outcomes,
        },
        clobError: sanitizeExternalError(error),
      });
    }
    if (verifiedConditionIds.length >= 5) break;
  }

  const orderbookProbes = [];
  for (const conditionId of verifiedConditionIds) {
    try {
      orderbookProbes.push(await probePublicMarket(clob, conditionId));
    } catch (error) {
      orderbookProbes.push({ conditionId, probeError: sanitizeExternalError(error) });
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        purpose: 'GAMMA_TO_CLOB_SEMANTIC_DISCOVERY',
        mode: 'PAPER_ONLY',
        gammaReturned: gammaMarkets.length,
        gammaCandidates: candidates.length,
        semanticSamples,
        verifiedMarkets: verifiedConditionIds.length,
        orderbookProbes,
      },
      null,
      2
    ) + '\n'
  );

  if (semanticSamples.length === 0) {
    throw new Error('NO_VALID_GAMMA_DISCOVERY_CANDIDATES');
  }
  if (verifiedConditionIds.length < 5) {
    throw new Error('FEWER_THAN_5_VERIFIED_CURRENT_MARKETS');
  }
}

main().catch((error) => {
  process.stderr.write('PROBE_FAILED ' + sanitizeExternalError(error) + '\n');
  process.exitCode = 1;
});
