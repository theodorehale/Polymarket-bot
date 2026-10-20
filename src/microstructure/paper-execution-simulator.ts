import { evaluatePolymarketBookEvidence } from './evidence-gate.js';
import type { PaperExecutionAttempt, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

export interface PaperExecutionConfig {
  latencyMs: number;
  feeRate?: number;
  minNetEdge?: number;
  maxBookAgeMs?: number;
  maxArrivalDelayMs?: number;
}

export interface PaperSignal {
  attemptId: string;
  marketId: string;
  tokenId: string;
  signalReceivedAtMs: number;
  signalMonotonicNs: string;
  side: 'BUY' | 'SELL';
  requestedSize: number;
  fairPrice: number;
}

function parseMonotonicNs(value: string | undefined): bigint | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function durationNs(ms: number): bigint {
  return BigInt(Math.round(ms * 1_000_000));
}

function reject(
  signal: PaperSignal,
  cfg: Required<PaperExecutionConfig>,
  status: PaperExecutionAttempt['status'],
  reason: string,
): PaperExecutionAttempt {
  const signalMono = parseMonotonicNs(signal.signalMonotonicNs);
  const arrivalMono = signalMono === undefined ? undefined : signalMono + durationNs(cfg.latencyMs);
  return {
    schemaVersion: 'hale-5m-paper-attempt-v0.1',
    attemptId: signal.attemptId,
    marketId: signal.marketId,
    tokenId: signal.tokenId,
    signalReceivedAtMs: signal.signalReceivedAtMs,
    signalMonotonicNs: signal.signalMonotonicNs,
    hypotheticalArrivalAtMs: signal.signalReceivedAtMs + cfg.latencyMs,
    hypotheticalArrivalMonotonicNs: arrivalMono?.toString(),
    configuredLatencyMs: cfg.latencyMs,
    side: signal.side,
    requestedSize: signal.requestedSize,
    referencePrice: signal.fairPrice,
    status,
    reason,
  };
}

/**
 * Deterministic paper execution against the first REAL book observed at/after
 * hypothetical arrival. No live order path exists in this module.
 *
 * Scientific timing rule:
 * - wall clock is retained only for readable provenance;
 * - arrival/fill ordering and latency bounds use the shared process monotonic clock.
 */
export function simulatePaperExecution(
  signal: PaperSignal,
  book: UnifiedMarketEvent<PolymarketBookPayload>,
  config: PaperExecutionConfig,
): PaperExecutionAttempt {
  const cfg: Required<PaperExecutionConfig> = {
    latencyMs: config.latencyMs,
    feeRate: config.feeRate ?? NaN,
    minNetEdge: config.minNetEdge ?? 0,
    maxBookAgeMs: config.maxBookAgeMs ?? 1_000,
    maxArrivalDelayMs: config.maxArrivalDelayMs ?? 100,
  };

  const signalMono = parseMonotonicNs(signal.signalMonotonicNs);
  const bookMono = parseMonotonicNs(book.clock?.monotonicReceivedNs);
  const arrivalMono = signalMono === undefined ? undefined : signalMono + durationNs(cfg.latencyMs);

  if (
    ![
      signal.signalReceivedAtMs,
      signal.requestedSize,
      signal.fairPrice,
      cfg.latencyMs,
      cfg.feeRate,
      cfg.minNetEdge,
      cfg.maxBookAgeMs,
      cfg.maxArrivalDelayMs,
    ].every(Number.isFinite) ||
    signalMono === undefined ||
    bookMono === undefined ||
    arrivalMono === undefined ||
    signal.requestedSize <= 0 ||
    signal.fairPrice <= 0 ||
    signal.fairPrice >= 1 ||
    cfg.latencyMs < 0 ||
    cfg.feeRate < 0 ||
    cfg.feeRate > 1 ||
    cfg.maxBookAgeMs < 0 ||
    cfg.maxArrivalDelayMs < 0 ||
    !['BUY', 'SELL'].includes(signal.side)
  ) {
    return reject(signal, cfg, 'REJECTED_NO_EDGE', 'INVALID_SIGNAL_OR_MISSING_FEE_OR_MONOTONIC_CLOCK');
  }

  if (
    !signal.marketId ||
    !signal.tokenId ||
    book.marketId !== signal.marketId ||
    book.tokenId !== signal.tokenId
  ) {
    return reject(signal, cfg, 'REJECTED_STALE_BOOK', 'BOOK_IDENTITY_MISMATCH');
  }

  const evidence = evaluatePolymarketBookEvidence(
    book,
    book.clock.receivedAtMs,
    { maxAgeMs: cfg.maxBookAgeMs },
  );
  if (!evidence.accepted) {
    return reject(signal, cfg, 'REJECTED_STALE_BOOK', evidence.reason);
  }

  const maxArrivalDelayNs = durationNs(cfg.maxArrivalDelayMs);
  if (bookMono < arrivalMono) {
    return reject(signal, cfg, 'PAPER_MISSED', 'BOOK_PRECEDES_HYPOTHETICAL_ARRIVAL');
  }
  if (bookMono > arrivalMono + maxArrivalDelayNs) {
    return reject(signal, cfg, 'PAPER_MISSED', 'BOOK_TOO_LATE_AFTER_ARRIVAL');
  }

  const levels = signal.side === 'BUY' ? book.payload.asks : book.payload.bids;
  let remaining = signal.requestedSize;
  let notional = 0;
  let filled = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.size);
    notional += take * level.price;
    filled += take;
    remaining -= take;
  }

  if (filled < signal.requestedSize || filled <= 0) {
    return reject(signal, cfg, 'REJECTED_NO_DEPTH', 'INSUFFICIENT_EXECUTABLE_DEPTH');
  }

  const executablePrice = notional / filled;
  const grossEdge = signal.side === 'BUY'
    ? signal.fairPrice - executablePrice
    : executablePrice - signal.fairPrice;

  // Explicit linear cost scenario only; verified market cashflow uses fees-and-pnl.ts.
  const estimatedFees = executablePrice * filled * cfg.feeRate;
  const feePerUnit = estimatedFees / filled;
  const netEdge = grossEdge - feePerUnit;

  if (netEdge < cfg.minNetEdge) {
    return {
      ...reject(signal, cfg, 'REJECTED_NO_EDGE', 'NET_EDGE_BELOW_THRESHOLD'),
      executablePrice,
      executableSize: filled,
      estimatedFees,
      estimatedSlippage: Math.abs(executablePrice - levels[0].price),
      grossEdge,
      netEdge,
    };
  }

  return {
    ...reject(signal, cfg, 'PAPER_FILLED', 'PAPER_FILL_AT_OR_AFTER_CONFIGURED_ARRIVAL'),
    fillObservedAtMs: book.clock.receivedAtMs,
    fillObservedMonotonicNs: book.clock.monotonicReceivedNs,
    executablePrice,
    executableSize: filled,
    estimatedFees,
    estimatedSlippage: Math.abs(executablePrice - levels[0].price),
    grossEdge,
    netEdge,
  };
}
