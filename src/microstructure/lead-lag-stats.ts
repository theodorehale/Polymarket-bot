import type { LeadLagObservation } from './types.js';

export interface LeadLagSummary {
  /** Number of explicit shock outcomes recorded, including TIMEOUT. */
  totalShocks: number;
  /** Number of shocks with an observed Polymarket response. */
  responses: number;
  /** Number of shocks that expired without an observed response. */
  timeouts: number;
  responseRate: number;
  /** Backward-compatible latency sample count; equal to responses. */
  n: number;
  minMs?: number;
  p50Ms?: number;
  p90Ms?: number;
  p99Ms?: number;
  maxMs?: number;
}

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function summarizeLeadLag(observations: LeadLagObservation[]): LeadLagSummary {
  const values = observations
    .filter(x => x.reactionStatus !== 'TIMEOUT')
    .map(x => x.spotToPolyRepriceMs)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);

  const timeouts = observations.filter(x => x.reactionStatus === 'TIMEOUT').length;
  const totalShocks = values.length + timeouts;

  return {
    totalShocks,
    responses: values.length,
    timeouts,
    responseRate: totalShocks ? values.length / totalShocks : 0,
    n: values.length,
    minMs: values[0],
    p50Ms: percentile(values, 0.50),
    p90Ms: percentile(values, 0.90),
    p99Ms: percentile(values, 0.99),
    maxMs: values.at(-1),
  };
}
