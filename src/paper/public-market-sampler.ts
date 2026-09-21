/**
 * Phase 4.0 credential-free batch sampler.
 *
 * Observes a set of public binary markets and aggregates paper-only results.
 * It intentionally accepts only the two read-only MarketService methods used
 * by the public adapter. No trading service, wallet, signer, credentials, or
 * order-submission callback can be supplied here.
 */
import type { MarketService } from '../services/market-service.js';
import type { PaperObservationConfig, PaperObservation } from './public-market-observer.js';
import { observePublicMarket } from './public-market-observer.js';
import { observationToJsonl, summarizePaperObservations, type PaperObservationStats } from './observation-stats.js';
import { sanitizeExternalError } from '../research/security-boundary.js';

export interface BatchPaperSample {
  mode: 'PAPER_ONLY';
  startedAt: number;
  finishedAt: number;
  requestedMarkets: number;
  successfulObservations: number;
  failedObservations: number;
  observations: PaperObservation[];
  errors: Array<{ conditionId: string; error: string }>;
  stats: PaperObservationStats;
  jsonl: string[];
}

export async function samplePublicMarkets(
  markets: Pick<MarketService, 'resolveMarketTokens' | 'getTokenOrderbook'>,
  conditionIds: readonly string[],
  config: PaperObservationConfig,
  now: () => number = Date.now
): Promise<BatchPaperSample> {
  const startedAt = now();
  const observations: PaperObservation[] = [];
  const errors: Array<{ conditionId: string; error: string }> = [];

  for (const conditionId of conditionIds) {
    try {
      observations.push(await observePublicMarket(markets, conditionId, config, now()));
    } catch (error) {
      errors.push({
        conditionId,
        error: sanitizeExternalError(error),
      });
    }
  }

  return {
    mode: 'PAPER_ONLY',
    startedAt,
    finishedAt: now(),
    requestedMarkets: conditionIds.length,
    successfulObservations: observations.length,
    failedObservations: errors.length,
    observations,
    errors,
    stats: summarizePaperObservations(observations),
    jsonl: observations.map(observationToJsonl),
  };
}
