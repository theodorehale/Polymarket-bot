export interface ReconstructedLevel {
  price: number;
  size: number;
}

export interface PolymarketBookSnapshotInput {
  assetId: string;
  bids: ReconstructedLevel[];
  asks: ReconstructedLevel[];
}

export interface PolymarketPriceChangeInput {
  assetId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  reportedBestBid: number;
  reportedBestAsk: number;
}

export interface ReconstructedTopOfBook {
  assetId: string;
  bestBid: number;
  bestAsk: number;
  reportedBestBid: number;
  reportedBestAsk: number;
  matchesReportedBbo: boolean;
}

interface TokenBook {
  bids: Map<number, number>;
  asks: Map<number, number>;
}

const EPS = 1e-12;

function validPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validLevelPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function validSize(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function mapLevels(levels: ReconstructedLevel[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const level of levels) {
    if (!validLevelPrice(level.price) || !validSize(level.size) || level.size === 0) {
      throw new Error('INVALID_BOOK_LEVEL');
    }
    if (out.has(level.price)) throw new Error('DUPLICATE_BOOK_LEVEL');
    out.set(level.price, level.size);
  }
  return out;
}

function top(book: TokenBook): { bestBid: number; bestAsk: number } {
  const bidPrices = [...book.bids.keys()];
  const askPrices = [...book.asks.keys()];
  return {
    bestBid: bidPrices.length ? Math.max(...bidPrices) : 0,
    bestAsk: askPrices.length ? Math.min(...askPrices) : 1,
  };
}

/**
 * Deterministic L2 reconstruction for the public Polymarket market channel.
 *
 * The side rule is evidence-backed by capture replay:
 *   BUY  -> bid level update
 *   SELL -> ask level update
 *
 * A size of zero removes the level. Empty sides use public-feed BBO sentinels
 * bestBid=0 / bestAsk=1. Every incremental update is checked against the
 * feed-reported best_bid / best_ask and callers should fail closed on mismatch.
 */
export class PolymarketBookReconstructor {
  private readonly books = new Map<string, TokenBook>();

  applySnapshot(snapshot: PolymarketBookSnapshotInput): void {
    if (!snapshot.assetId) throw new Error('MISSING_ASSET_ID');
    this.books.set(snapshot.assetId, {
      bids: mapLevels(snapshot.bids),
      asks: mapLevels(snapshot.asks),
    });
  }

  applyPriceChange(change: PolymarketPriceChangeInput): ReconstructedTopOfBook {
    if (!change.assetId) throw new Error('MISSING_ASSET_ID');
    if (!validLevelPrice(change.price) || !validSize(change.size)) {
      throw new Error('INVALID_PRICE_CHANGE_LEVEL');
    }
    if (!validPrice(change.reportedBestBid) || !validPrice(change.reportedBestAsk)) {
      throw new Error('INVALID_REPORTED_BBO');
    }

    const book = this.books.get(change.assetId);
    if (!book) throw new Error('MISSING_INITIAL_BOOK_SNAPSHOT');

    const levels = change.side === 'BUY' ? book.bids : book.asks;
    if (change.size === 0) levels.delete(change.price);
    else levels.set(change.price, change.size);

    const reconstructed = top(book);
    const matchesReportedBbo =
      Math.abs(reconstructed.bestBid - change.reportedBestBid) <= EPS &&
      Math.abs(reconstructed.bestAsk - change.reportedBestAsk) <= EPS;

    return {
      assetId: change.assetId,
      bestBid: reconstructed.bestBid,
      bestAsk: reconstructed.bestAsk,
      reportedBestBid: change.reportedBestBid,
      reportedBestAsk: change.reportedBestAsk,
      matchesReportedBbo,
    };
  }

  snapshot(assetId: string): { bids: ReconstructedLevel[]; asks: ReconstructedLevel[] } | undefined {
    const book = this.books.get(assetId);
    if (!book) return undefined;
    return {
      bids: [...book.bids].map(([price, size]) => ({ price, size })).sort((a, b) => b.price - a.price),
      asks: [...book.asks].map(([price, size]) => ({ price, size })).sort((a, b) => a.price - b.price),
    };
  }
}
