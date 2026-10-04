/**
 * Hale One 5M Microstructure Lab V0.1
 *
 * PAPER-ONLY research types. Nothing in this module can sign, submit,
 * broadcast, or otherwise execute a live order.
 */

export type MarketEventSource = 'binance' | 'polymarket';

export type MarketEventKind =
  | 'trade'
  | 'book_snapshot'
  | 'book_delta'
  | 'price_change'
  | 'market_metadata';

export interface EventClock {
  /** Source/exchange timestamp when provided by the upstream feed. */
  sourceTimestampMs?: number;
  /** Local wall-clock receive time (Date.now()). */
  receivedAtMs: number;
  /** Local monotonic receive time for intra-process latency ordering. */
  monotonicReceivedNs: string;
}

export interface UnifiedMarketEvent<TPayload = unknown> {
  schemaVersion: 'hale-5m-event-v0.1';
  source: MarketEventSource;
  kind: MarketEventKind;
  instrument: string;
  marketId?: string;
  tokenId?: string;
  clock: EventClock;
  sequence?: string;
  payload: TPayload;
}

export interface BinanceTradePayload {
  symbol: string;
  tradeId: number;
  price: number;
  quantity: number;
  buyerIsMaker: boolean;
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface PolymarketBookPayload {
  side?: 'UP' | 'DOWN' | 'YES' | 'NO';
  bids: BookLevel[];
  asks: BookLevel[];
}

export type PaperAttemptStatus =
  | 'ELIGIBLE'
  | 'REJECTED_STALE_BOOK'
  | 'REJECTED_NO_DEPTH'
  | 'REJECTED_NO_EDGE'
  | 'PAPER_FILLED'
  | 'PAPER_MISSED';

export interface PaperExecutionAttempt {
  schemaVersion: 'hale-5m-paper-attempt-v0.1';
  attemptId: string;
  marketId: string;
  tokenId: string;
  signalReceivedAtMs: number;
  hypotheticalArrivalAtMs: number;
  configuredLatencyMs: number;
  side: 'BUY' | 'SELL';
  requestedSize: number;
  referencePrice: number;
  executablePrice?: number;
  executableSize?: number;
  estimatedFees?: number;
  estimatedSlippage?: number;
  grossEdge?: number;
  netEdge?: number;
  status: PaperAttemptStatus;
  /** Deterministic reason; do not let an LLM override a rejection. */
  reason: string;
}

export interface LeadLagObservation {
  schemaVersion: 'hale-5m-leadlag-v0.1';
  observationId: string;
  marketId: string;
  spotInstrument: string;
  t0SpotShockMs: number;
  t1FairValueChangeMs?: number;
  t2PolyRepriceStartMs?: number;
  t3StaleQuoteGoneMs?: number;
  t4HypotheticalArrivalMs?: number;
  t5HypotheticalFillMs?: number;
  spotToPolyRepriceMs?: number;
  staleQuoteLifetimeMs?: number;
  paperAttemptId?: string;
}
