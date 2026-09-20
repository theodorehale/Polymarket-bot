import { describe, expect, it } from 'vitest';
import { summarizePaperObservations, observationToJsonl } from './observation-stats.js';

const obs = (status: 'PAPER_EXECUTABLE' | 'REJECTED', reasons: string[] = [], expected = 0, worst = 0) => ({
  mode: 'PAPER_ONLY' as const,
  conditionId: 'c',
  yesTokenId: 'YES',
  noTokenId: 'NO',
  observedAt: 1,
  status,
  rejectionReasons: reasons,
  result: {
    mode: 'PAPER_ONLY' as const,
    paperExecutable: status === 'PAPER_EXECUTABLE',
    observedAt: 1,
    quote: {
      type: 'long' as const,
      targetPairShares: 10,
      expectedNetProfitUsd: expected,
      worstCaseNetProfitUsd: worst,
      expectedNetEdgeBps: 1,
      worstCaseNetEdgeBps: 1,
      expectedGrossProfitUsd: expected,
      worstCaseGrossProfitUsd: worst,
      expectedFeesUsd: 0,
      worstCaseFeesUsd: 0,
      expectedGasUsd: 0,
      worstCaseGasUsd: 0,
      expectedOtherCostsUsd: 0,
      worstCaseOtherCostsUsd: 0,
      yesLeg: {} as any,
      noLeg: {} as any,
      books: {} as any,
      safeToExecute: status === 'PAPER_EXECUTABLE',
      rejectionReasons: reasons,
      createdAt: 1,
    },
  },
});

describe('observation stats', () => {
  it('counts executable observations and rejection reasons', () => {
    const s = summarizePaperObservations([
      obs('PAPER_EXECUTABLE', [], 0.4, 0.2),
      obs('REJECTED', ['YES_BOOK_STALE']),
      obs('REJECTED', ['YES_BOOK_STALE', 'NO_BOOK_STALE']),
    ]);
    expect(s.total).toBe(3);
    expect(s.paperExecutable).toBe(1);
    expect(s.rejected).toBe(2);
    expect(s.executableRate).toBeCloseTo(1 / 3);
    expect(s.rejectionReasons.YES_BOOK_STALE).toBe(2);
    expect(s.rejectionReasons.NO_BOOK_STALE).toBe(1);
    expect(s.expectedNetProfitUsd.avg).toBeCloseTo(0.4);
    expect(s.worstCaseNetProfitUsd.avg).toBeCloseTo(0.2);
  });

  it('emits compact JSONL without wallet or secret fields', () => {
    const line = observationToJsonl(obs('PAPER_EXECUTABLE', [], 0.4, 0.2));
    const parsed = JSON.parse(line);
    expect(parsed.mode).toBe('PAPER_ONLY');
    expect(parsed.quote.safeToExecute).toBe(true);
    expect(line.toLowerCase()).not.toContain('privatekey');
    expect(line.toLowerCase()).not.toContain('wallet');
    expect(line.toLowerCase()).not.toContain('signer');
  });
});
