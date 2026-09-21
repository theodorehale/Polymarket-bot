import { describe, expect, it } from 'vitest';
import type { JevPaperJudgment } from '../paper/jev-paper-judge.js';
import type { PaperObservation } from '../paper/public-market-observer.js';
import type { ExecutableArbQuote } from '../utils/executable-edge.js';
import { toUniversalPolymarketObservation } from './polymarket-observation-adapter.js';
import { validateUniversalObservation } from './universal-observation.js';

function quote(safeToExecute = true): ExecutableArbQuote {
  return {
    type: 'long',
    targetPairShares: 10,
    expectedNetProfitUsd: safeToExecute ? 0.2 : -0.1,
    worstCaseNetProfitUsd: safeToExecute ? 0.1 : -0.2,
    expectedNetEdgeBps: safeToExecute ? 200 : -100,
    worstCaseNetEdgeBps: safeToExecute ? 100 : -200,
    expectedGrossProfitUsd: safeToExecute ? 0.3 : 0,
    worstCaseGrossProfitUsd: safeToExecute ? 0.2 : -0.1,
    expectedFeesUsd: 0,
    worstCaseFeesUsd: 0,
    expectedGasUsd: 0,
    worstCaseGasUsd: 0,
    expectedOtherCostsUsd: 0.1,
    worstCaseOtherCostsUsd: 0.1,
    yesLeg: {
      tokenId: 'yes',
      side: 'BUY',
      targetShares: 10,
      fullyFillable: safeToExecute,
      expectedVwap: 0.44,
      expectedNotionalUsd: 4.4,
      worstPriceConsumed: 0.44,
      executionLimitPrice: 0.44,
      expectedFeeUsd: 0,
      worstCaseFeeUsd: 0,
      depthConsumed: [],
    },
    noLeg: {
      tokenId: 'no',
      side: 'BUY',
      targetShares: 10,
      fullyFillable: safeToExecute,
      expectedVwap: 0.53,
      expectedNotionalUsd: 5.3,
      worstPriceConsumed: 0.53,
      executionLimitPrice: 0.53,
      expectedFeeUsd: 0,
      worstCaseFeeUsd: 0,
      depthConsumed: [],
    },
    books: {
      fresh: true,
      yesAgeMs: 10,
      noAgeMs: 15,
      skewMs: 5,
      maxAgeMs: 1000,
      maxSkewMs: 250,
      reasons: [],
    },
    safeToExecute,
    rejectionReasons: safeToExecute ? [] : ['INSUFFICIENT_YES_DEPTH'],
    createdAt: 1_700_000_000_000,
  };
}

function observation(safeToExecute = true): PaperObservation {
  const q = quote(safeToExecute);
  return {
    mode: 'PAPER_ONLY',
    conditionId: '0xcondition',
    yesTokenId: 'yes',
    noTokenId: 'no',
    observedAt: 1_700_000_000_000,
    status: safeToExecute ? 'PAPER_EXECUTABLE' : 'REJECTED',
    rejectionReasons: [...q.rejectionReasons],
    result: {
      mode: 'PAPER_ONLY',
      paperExecutable: safeToExecute,
      quote: q,
      observedAt: 1_700_000_000_000,
    },
  };
}

function jev(status: JevPaperJudgment['status']): JevPaperJudgment {
  return {
    mode: 'PAPER_ONLY',
    promptVersion: 'jev-paper-judge-v1',
    judgedAt: 1_700_000_000_100,
    completedAt: 1_700_000_000_250,
    latencyMs: 150,
    acceptThreshold: 0.8,
    deterministicStatus: 'PAPER_EXECUTABLE',
    probability: status === 'ACCEPT' ? 0.9 : 0.6,
    status,
  };
}

function baseInput() {
  return {
    observationId: 'obs-polymarket-1',
    provenance: {
      dataSource: 'polymarket-clob',
      feedType: 'rest-orderbook',
      snapshotOrIncremental: 'SNAPSHOT' as const,
      sourceTimestamp: 1_700_000_000_000,
      receivedTimestamp: 1_700_000_000_010,
      observationTimestamp: 1_700_000_000_020,
      sourceClock: 'LOCAL' as const,
      depthCapability: 'FULL_DEPTH' as const,
      depthCapabilityBasis: 'SOURCE_RESPONSE' as const,
      quality: 'VALID' as const,
      qualityReasons: [],
    },
    sampling: {
      group: 'DETERMINISTIC_CANDIDATE' as const,
      discoveryReason: 'test fixture',
      eligibilityChecks: [{ name: 'binary', passed: true }],
    },
    versions: {
      samplingVersion: 'sampling-v1',
      relationshipVersion: 'complement-v1',
      deterministicEngineVersion: 'executable-edge-v1',
      executionModelVersion: 'paper-execution-v1',
      feeModelVersion: 'fee-v1',
      costModelVersion: 'cost-v1',
    },
  };
}

describe('toUniversalPolymarketObservation', () => {
  it('maps deterministic rejection to universal REJECT without upgrade', () => {
    const result = toUniversalPolymarketObservation({
      ...baseInput(),
      observation: observation(false),
    });

    expect(result.deterministic.status).toBe('REJECT');
    expect(result.classification.finalPaperDecision).toBe('REJECT');
    expect(result.classification.reasons).toContain('INSUFFICIENT_YES_DEPTH');
  });

  it('does not promote Jev ACCEPT to universal ACCEPT before accessibility is verified', () => {
    const result = toUniversalPolymarketObservation({
      ...baseInput(),
      observation: observation(true),
      jev: jev('ACCEPT'),
    });

    expect(result.jev?.status).toBe('ACCEPT');
    expect(result.classification.finalPaperDecision).toBe('REVIEW');
    expect(result.classification.reasons).toContain('ACCESSIBILITY_NOT_VERIFIED');
    expect(result.classification.reasons).toContain('RELATIONSHIP_NOT_VERIFIED');
    expect(result.relationship.verification.status).toBe('UNVERIFIED');
    expect(result.execution.accessibilityStatus).toBe('UNKNOWN');
    expect(validateUniversalObservation(result)).toEqual({ valid: true, reasons: [] });
  });

  it('keeps a deterministic PASS under review when Jev was not evaluated', () => {
    const result = toUniversalPolymarketObservation({
      ...baseInput(),
      observation: observation(true),
    });

    expect(result.deterministic.status).toBe('PASS');
    expect(result.classification.finalPaperDecision).toBe('REVIEW');
    expect(result.classification.reasons).toContain('JEV_NOT_EVALUATED');
  });

  it('records source provenance and version metadata explicitly', () => {
    const result = toUniversalPolymarketObservation({
      ...baseInput(),
      observation: observation(true),
      jev: jev('REVIEW'),
    });

    expect(result.provenance.dataSource).toBe('polymarket-clob');
    expect(result.provenance.depthCapability).toBe('FULL_DEPTH');
    expect(result.deterministic.targetSize).toEqual({ amount: 10, unit: 'PAIRED_SHARES' });
    expect(result.deterministic.expectedNetProfit).toEqual({ amount: 0.2, currency: 'USD' });
    expect(result.versions.samplingVersion).toBe('sampling-v1');
    expect(result.versions.promptVersion).toBe('jev-paper-judge-v1');
  });
});
