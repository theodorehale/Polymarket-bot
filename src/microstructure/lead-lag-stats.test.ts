import { describe, expect, it } from 'vitest';
import { summarizeLeadLag } from './lead-lag-stats.js';
import type { LeadLagObservation } from './types.js';

const obs = (ms: number): LeadLagObservation => ({
  schemaVersion: 'hale-5m-leadlag-v0.1',
  observationId: String(ms),
  marketId: 'm',
  spotInstrument: 'BTCUSDT',
  t0SpotShockMs: 0,
  t2PolyRepriceStartMs: ms,
  spotToPolyRepriceMs: ms,
});

describe('summarizeLeadLag', () => {
  it('computes deterministic nearest-rank percentiles', () => {
    const s = summarizeLeadLag([10,20,30,40,50,60,70,80,90,100].map(obs));
    expect(s).toEqual({ n: 10, minMs: 10, p50Ms: 50, p90Ms: 90, p99Ms: 100, maxMs: 100 });
  });
});
