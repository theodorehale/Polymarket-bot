/**
 * Phase 4.0 public-data adapter.
 *
 * Converts read-only MarketService orderbooks into the hardened executable
 * book shape. This module has no wallet, signer, credential, trading service,
 * or order-submission dependency.
 */
import type { MarketService } from '../services/market-service.js';
import type { ExecutableBook } from '../utils/executable-edge.js';

export interface PublicBinaryBooks {
  yesTokenId: string;
  noTokenId: string;
  yesBook: ExecutableBook;
  noBook: ExecutableBook;
}

function normalizePublicBook(book: {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: number;
}): ExecutableBook {
  // Do not filter malformed prices here: executable-edge must see them and
  // fail closed instead of silently turning a malformed venue response into
  // an apparently valid book.
  return {
    bids: book.bids.map((l) => ({ price: l.price, size: l.size })),
    asks: book.asks.map((l) => ({ price: l.price, size: l.size })),
    timestampMs: book.timestamp,
  };
}

export async function fetchPublicBinaryBooks(
  markets: Pick<MarketService, 'resolveMarketTokens' | 'getTokenOrderbook'>,
  conditionId: string
): Promise<PublicBinaryBooks> {
  const tokens = await markets.resolveMarketTokens(conditionId);
  if (!tokens) throw new Error('PUBLIC_MARKET_TOKENS_UNAVAILABLE');

  const [yesRaw, noRaw] = await Promise.all([
    markets.getTokenOrderbook(tokens.primaryTokenId),
    markets.getTokenOrderbook(tokens.secondaryTokenId),
  ]);

  return {
    yesTokenId: tokens.primaryTokenId,
    noTokenId: tokens.secondaryTokenId,
    yesBook: normalizePublicBook(yesRaw),
    noBook: normalizePublicBook(noRaw),
  };
}
