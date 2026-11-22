import { describe, expect, it } from 'vitest';
import { summarizeLeadLag } from './lead-lag-stats.js';
import type { LeadLagObservation } from './types.js';

const obs = (ms: number): LeadLagObservation => ({
  schemaVersion: 'hale-5m-leadlag-v0.1',
  observationId: String(ms),
  marketId: 'm',
  spotInstrument: 'BTCUSDT',
  reactionStatus: 'RESPONDED',
  t0SpotShockMs: 0,
  t2PolyRepriceStartMs: ms,
  spotToPolyRepriceMs: ms,
});

const timeout = (id: string): LeadLagObservation => ({
  schemaVersion: 'hale-5m-leadlag-v0.1',
  observationId: id,
  marketId: 'm',
  spotInstrument: 'BTCUSDT',
  reactionStatus: 'TIMEOUT',
  t0SpotShockMs: 0,
});

describe('summarizeLeadLag', () => {
  it('computes deterministic latency percentiles and preserves timeout missingness', () => {
    const rows = [10,20,30,40,50,60,70,80,90,100].map(obs);
    rows.push(timeout('timeout-1'), timeout('timeout-2'));

    expect(summarizeLeadLag(rows)).toEqual({
      totalShocks: 12,
      responses: 10,
      timeouts: 2,
      responseRate: 10 / 12,
      n: 10,
      minMs: 10,
      p50Ms: 50,
      p90Ms: 90,
      p99Ms: 100,
      maxMs: 100,
    });
  });
});
