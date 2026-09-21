import { describe, expect, it, vi } from 'vitest';
import type { PaperObservation } from './public-market-observer.js';
import { judgePaperObservationWithJev } from './jev-paper-judge.js';

function observation(status: PaperObservation['status']): PaperObservation {
  return {
    mode: 'PAPER_ONLY',
    conditionId: 'condition-1',
    yesTokenId: 'YES',
    noTokenId: 'NO',
    observedAt: 10_000,
    status,
    rejectionReasons: status === 'REJECTED' ? ['NEGATIVE_NET_EDGE'] : [],
    result: {
      paperExecutable: status === 'PAPER_EXECUTABLE',
      quote: {
        type: 'long',
        targetPairShares: 10,
        yesFill: { requestedShares: 10, filledShares: 10, fullyFilled: true, vwap: 0.44, notionalUsd: 4.4 },
        noFill: { requestedShares: 10, filledShares: 10, fullyFilled: true, vwap: 0.53, notionalUsd: 5.3 },
        expectedGrossCostUsd: 9.7,
        worstCaseGrossCostUsd: 9.7,
        expectedFeesUsd: 0,
        worstCaseFeesUsd: 0,
        expectedTotalCostUsd: 9.7,
        worstCaseTotalCostUsd: 9.7,
        expectedNetProfitUsd: 0.3,
        worstCaseNetProfitUsd: 0.3,
        expectedNetEdgeBps: 300,
        worstCaseNetEdgeBps: 300,
        safeToExecute: status === 'PAPER_EXECUTABLE',
        rejectionReasons: status === 'REJECTED' ? ['NEGATIVE_NET_EDGE'] : [],
      },
    },
  } as unknown as PaperObservation;
}

describe('judgePaperObservationWithJev', () => {
  it('never lets Jev promote a deterministic rejection', async () => {
    const systemOne = vi.fn();
    const r = await judgePaperObservationWithJev(observation('REJECTED'), { client: { systemOne } as never });
    expect(r.status).toBe('REJECT');
    expect(systemOne).not.toHaveBeenCalled();
  });

  it('accepts a paper candidate when Jev probability clears the calibration threshold', async () => {
    const client = { systemOne: vi.fn().mockResolvedValue({ answers: { acceptable: { noul: 0.92 } } }) };
    const r = await judgePaperObservationWithJev(observation('PAPER_EXECUTABLE'), {
      client: client as never,
      acceptThreshold: 0.8,
    });
    expect(r.status).toBe('ACCEPT');
    expect(r.probability).toBe(0.92);
    expect(r.acceptThreshold).toBe(0.8);
    expect(r.completedAt).toBeGreaterThanOrEqual(r.judgedAt);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('routes a lower Jev probability to review rather than silently accepting it', async () => {
    const client = { systemOne: vi.fn().mockResolvedValue({ answers: { acceptable: { noul: 0.61 } } }) };
    const r = await judgePaperObservationWithJev(observation('PAPER_EXECUTABLE'), {
      client: client as never,
      acceptThreshold: 0.8,
    });
    expect(r.status).toBe('REVIEW');
    expect(r.probability).toBe(0.61);
  });

  it('fails closed when Jev is unavailable', async () => {
    const client = { systemOne: vi.fn().mockRejectedValue(new Error('network down')) };
    const r = await judgePaperObservationWithJev(observation('PAPER_EXECUTABLE'), { client: client as never });
    expect(r.status).toBe('JEV_UNAVAILABLE');
    expect(r.error).toBe('network down');
  });

  it('fails closed on an invalid probability', async () => {
    const client = { systemOne: vi.fn().mockResolvedValue({ answers: { acceptable: { noul: 1.2 } } }) };
    const r = await judgePaperObservationWithJev(observation('PAPER_EXECUTABLE'), { client: client as never });
    expect(r.status).toBe('JEV_UNAVAILABLE');
    expect(r.error).toBe('INVALID_JEV_PROBABILITY');
  });

  it('fails closed on an invalid calibration threshold without calling Jev', async () => {
    const systemOne = vi.fn();
    const r = await judgePaperObservationWithJev(observation('PAPER_EXECUTABLE'), {
      client: { systemOne } as never,
      acceptThreshold: 1.2,
    });
    expect(r.status).toBe('JEV_UNAVAILABLE');
    expect(r.error).toBe('INVALID_JEV_ACCEPT_THRESHOLD');
    expect(systemOne).not.toHaveBeenCalled();
  });
});
