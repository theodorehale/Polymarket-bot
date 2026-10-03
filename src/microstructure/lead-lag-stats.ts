import type { LeadLagObservation } from './types.js';

export interface LeadLagSummary {
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
    .map(x => x.spotToPolyRepriceMs)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);

  return {
    n: values.length,
    minMs: values[0],
    p50Ms: percentile(values, 0.50),
    p90Ms: percentile(values, 0.90),
    p99Ms: percentile(values, 0.99),
    maxMs: values.at(-1),
  };
}
