import type { LeadLagObservation, PaperExecutionAttempt, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';
import { simulatePaperExecution } from './paper-execution-simulator.js';

export interface LatencySweepConfig {
  latenciesMs?: number[];
  requestedSize?: number;
  feeRate?: number;
  minNetEdge?: number;
}

export interface PaperCandidate {
  observation: LeadLagObservation;
  tokenId: string;
  direction: 'UP' | 'DOWN';
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

export function runLatencySweep(
  candidate: PaperCandidate,
  books: UnifiedMarketEvent<PolymarketBookPayload>[],
  config: LatencySweepConfig = {},
): PaperExecutionAttempt[] {
  if (candidate.observation.t2PolyRepriceStartMs !== undefined) {
    throw new Error('LOOKAHEAD_COMPLETED_OBSERVATION_IS_NOT_A_SIGNAL');
  }
  const signalMono = parseMonotonicNs(candidate.observation.t0SpotShockMonotonicNs);
  if (signalMono === undefined) throw new Error('MISSING_MONOTONIC_SIGNAL_CLOCK');

  const latencies = config.latenciesMs ?? [50, 100, 200, 500];
  const requestedSize = config.requestedSize ?? 10;
  const attempts: PaperExecutionAttempt[] = [];

  for (const latencyMs of latencies) {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      throw new Error('INVALID_LATENCY_SWEEP_VALUE');
    }
    const arrivalMono = signalMono + durationNs(latencyMs);
    const book = books
      .filter(b => {
        if (b.marketId !== candidate.observation.marketId || b.tokenId !== candidate.tokenId) return false;
        const mono = parseMonotonicNs(b.clock.monotonicReceivedNs);
        return mono !== undefined && mono >= arrivalMono;
      })
      .sort((a, b) => {
        const am = parseMonotonicNs(a.clock.monotonicReceivedNs)!;
        const bm = parseMonotonicNs(b.clock.monotonicReceivedNs)!;
        return am < bm ? -1 : am > bm ? 1 : 0;
      })[0];

    if (!book) {
      attempts.push({
        schemaVersion: 'hale-5m-paper-attempt-v0.1',
        attemptId: `${candidate.observation.observationId}-${latencyMs}`,
        marketId: candidate.observation.marketId,
        tokenId: candidate.tokenId,
        signalReceivedAtMs: candidate.observation.t0SpotShockMs,
        signalMonotonicNs: candidate.observation.t0SpotShockMonotonicNs,
        hypotheticalArrivalAtMs: candidate.observation.t0SpotShockMs + latencyMs,
        hypotheticalArrivalMonotonicNs: arrivalMono.toString(),
        configuredLatencyMs: latencyMs,
        side: 'BUY',
        requestedSize,
        referencePrice: candidate.fairPrice,
        status: 'PAPER_MISSED',
        reason: 'NO_BOOK_AT_OR_AFTER_HYPOTHETICAL_ARRIVAL',
      });
      continue;
    }

    attempts.push(simulatePaperExecution({
      attemptId: `${candidate.observation.observationId}-${latencyMs}`,
      marketId: candidate.observation.marketId,
      tokenId: candidate.tokenId,
      signalReceivedAtMs: candidate.observation.t0SpotShockMs,
      signalMonotonicNs: candidate.observation.t0SpotShockMonotonicNs,
      side: 'BUY',
      requestedSize,
      fairPrice: candidate.fairPrice,
    }, book, {
      latencyMs,
      feeRate: config.feeRate,
      minNetEdge: config.minNetEdge ?? 0,
    }));
  }

  return attempts;
}

export interface PaperSweepSummary {
  latencyMs: number;
  attempts: number;
  fills: number;
  misses: number;
  rejected: number;
  fillRate: number;
  meanNetEdge?: number;
}

export function summarizeLatencySweep(attempts: PaperExecutionAttempt[]): PaperSweepSummary[] {
  const latencies = [...new Set(attempts.map(a => a.configuredLatencyMs))].sort((a, b) => a - b);
  return latencies.map(latencyMs => {
    const rows = attempts.filter(a => a.configuredLatencyMs === latencyMs);
    const filled = rows.filter(a => a.status === 'PAPER_FILLED');
    const edges = filled.map(a => a.netEdge).filter((x): x is number => Number.isFinite(x));
    return {
      latencyMs,
      attempts: rows.length,
      fills: filled.length,
      misses: rows.filter(a => a.status === 'PAPER_MISSED').length,
      rejected: rows.filter(a => a.status.startsWith('REJECTED_')).length,
      fillRate: rows.length ? filled.length / rows.length : 0,
      meanNetEdge: edges.length ? edges.reduce((a, b) => a + b, 0) / edges.length : undefined,
    };
  });
}
