import { describe, expect, it } from 'vitest';
import {
  UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
  type UniversalObservationV1,
  validateUniversalObservation,
  universalObservationToJsonl,
} from './universal-observation.js';

function validObservation(): UniversalObservationV1 {
  return {
    schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
    observationId: 'obs-1',
    mode: 'PAPER_ONLY',
    observedAt: 1_700_000_000_000,
    venue: 'polymarket',
    marketType: 'PREDICTION',
    instrumentIds: ['yes-token', 'no-token'],
    conditionId: '0xcondition',
    versions: {
      schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
      samplingVersion: 'sampling-v1',
      relationshipVersion: 'complement-v1',
      deterministicEngineVersion: 'executable-edge-v1',
      executionModelVersion: 'paper-execution-v1',
      feeModelVersion: 'fee-v1',
      costModelVersion: 'cost-v1',
      promptVersion: 'jev-paper-judge-v1',
    },
    provenance: {
      dataSource: 'polymarket-clob',
      feedType: 'rest-orderbook',
      snapshotOrIncremental: 'SNAPSHOT',
      sourceTimestamp: 1_700_000_000_000,
      receivedTimestamp: 1_700_000_000_010,
      observationTimestamp: 1_700_000_000_020,
      dataDepth: 'FULL_DEPTH',
      quality: 'VALID',
      qualityReasons: [],
    },
    sampling: {
      group: 'DETERMINISTIC_CANDIDATE',
      discoveryReason: 'active binary market',
      eligibilityChecks: [
        { name: 'binary-market', passed: true },
        { name: 'orderbooks-present', passed: true },
      ],
    },
    relationship: {
      type: 'COMPLEMENT',
      relatedInstrumentIds: ['yes-token', 'no-token'],
      assumptions: ['complementary binary payout'],
      requiredInputs: ['yes-book', 'no-book'],
    },
    deterministic: {
      status: 'PASS',
      rejectionReasons: [],
      targetSize: 10,
      expectedGrossProfit: 0.3,
      worstCaseGrossProfit: 0.2,
      expectedNetProfit: 0.25,
      worstCaseNetProfit: 0.15,
      expectedNetEdgeBps: 250,
      worstCaseNetEdgeBps: 150,
      fees: 0,
      otherCosts: 0.05,
      freshness: { maxObservedAgeMs: 20, skewMs: 5 },
      depthSummary: { known: true, sufficientForTarget: true },
    },
    execution: {
      atomicity: 'NON_ATOMIC',
      legCount: 2,
      estimatedLatencyMs: 100,
      partialFillRisk: 'UNKNOWN',
      hedgeCompletionStatus: 'NOT_REQUIRED',
      capitalRequired: 9.7,
      accessibilityStatus: 'ACCESSIBLE',
    },
    jev: {
      promptVersion: 'jev-paper-judge-v1',
      acceptThreshold: 0.8,
      startedAt: 1_700_000_000_030,
      completedAt: 1_700_000_000_180,
      latencyMs: 150,
      probability: 0.84,
      status: 'ACCEPT',
    },
    classification: {
      opportunityClass: 'STRUCTURAL',
      finalPaperDecision: 'ACCEPT',
      reasons: [],
    },
    calibration: {
      persistence: [],
    },
  };
}

describe('UniversalObservationV1', () => {
  it('accepts a valid paper-only observation', () => {
    expect(validateUniversalObservation(validObservation())).toEqual({
      valid: true,
      reasons: [],
    });
  });

  it('forbids AI/final ACCEPT from overriding deterministic REJECT', () => {
    const observation = validObservation();
    observation.deterministic.status = 'REJECT';
    observation.deterministic.rejectionReasons = ['INSUFFICIENT_YES_DEPTH'];

    const result = validateUniversalObservation(observation);

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('DETERMINISTIC_REJECT_CANNOT_ACCEPT');
  });

  it('requires valid data and accessible execution for ACCEPT', () => {
    const observation = validObservation();
    observation.provenance.quality = 'STALE';
    observation.execution.accessibilityStatus = 'UNKNOWN';

    const result = validateUniversalObservation(observation);

    expect(result.reasons).toContain('ACCEPT_REQUIRES_VALID_DATA');
    expect(result.reasons).toContain('ACCEPT_REQUIRES_ACCESSIBLE_EXECUTION');
  });

  it('does not let top-of-book data prove full target depth', () => {
    const observation = validObservation();
    observation.provenance.dataDepth = 'TOP_OF_BOOK';

    const result = validateUniversalObservation(observation);

    expect(result.reasons).toContain('TOP_OF_BOOK_CANNOT_PROVE_FULL_TARGET_DEPTH');
  });

  it('fails closed on invalid Jev probability, threshold, or timing', () => {
    const observation = validObservation();
    observation.jev = {
      ...observation.jev!,
      acceptThreshold: 1.2,
      probability: -0.1,
      startedAt: 200,
      completedAt: 100,
      latencyMs: -1,
    };

    const result = validateUniversalObservation(observation);

    expect(result.reasons).toEqual(expect.arrayContaining([
      'INVALID_JEV_THRESHOLD',
      'INVALID_JEV_PROBABILITY',
      'INVALID_JEV_TIMING',
      'INVALID_JEV_LATENCY',
    ]));
  });

  it('serializes audit data without inventing vendor metadata', () => {
    const line = universalObservationToJsonl(validObservation());
    const parsed = JSON.parse(line);

    expect(parsed.schemaVersion).toBe('universal-observation-v1');
    expect(parsed.jev.vendorMetadata).toBeUndefined();
    expect(line.toLowerCase()).not.toContain('privatekey');
    expect(line.toLowerCase()).not.toContain('signer');
    expect(line.toLowerCase()).not.toContain('submitorder');
  });
});
