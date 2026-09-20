/**
 * Phase 4.0 live-public-data / zero-execution observation pipeline.
 * Fetches public books, then delegates the decision to the existing paper scanner.
 */
import type { MarketService } from '../services/market-service.js';
import type { ExecutableQuoteInput } from '../utils/executable-edge.js';
import { fetchPublicBinaryBooks } from './public-orderbook-adapter.js';
import { scanPaperArbitrage, type PaperArbitrageResult } from './paper-arbitrage-scanner.js';

export type PaperObservationConfig = Omit<
  ExecutableQuoteInput,
  'yesTokenId' | 'noTokenId' | 'yesBook' | 'noBook' | 'nowMs'
>;

export interface PaperObservation {
  mode: 'PAPER_ONLY';
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  observedAt: number;
  status: 'PAPER_EXECUTABLE' | 'REJECTED';
  rejectionReasons: string[];
  result: PaperArbitrageResult;
}

export async function observePublicMarket(
  markets: Pick<MarketService, 'resolveMarketTokens' | 'getTokenOrderbook'>,
  conditionId: string,
  config: PaperObservationConfig,
  nowMs: number = Date.now()
): Promise<PaperObservation> {
  const books = await fetchPublicBinaryBooks(markets, conditionId);
  const result = scanPaperArbitrage({
    ...config,
    yesTokenId: books.yesTokenId,
    noTokenId: books.noTokenId,
    yesBook: books.yesBook,
    noBook: books.noBook,
    nowMs,
  });

  return {
    mode: 'PAPER_ONLY',
    conditionId,
    yesTokenId: books.yesTokenId,
    noTokenId: books.noTokenId,
    observedAt: nowMs,
    status: result.paperExecutable ? 'PAPER_EXECUTABLE' : 'REJECTED',
    rejectionReasons: [...result.quote.rejectionReasons],
    result,
  };
}
