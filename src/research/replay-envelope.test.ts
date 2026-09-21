import { describe, expect, it } from 'vitest';
import {
  REPLAY_ENVELOPE_VERSION,
  replayEnvelopeToJsonl,
  type ReplayEnvelopeV1,
  validateReplayEnvelope,
} from './replay-envelope.js';
import {
  UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
  type UniversalObservationV1,
} from './universal-observation.js';

function observation(): UniversalObservationV1 {
  return {
    schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
    observationId: 'obs-replay-1',
    mode: 'PAPER_ONLY',
    observedAt: 1_700_000_000_000,
    venue: 'polymarket',
    marketType: 'PREDICTION',
    instrumentIds: ['yes', 'no'],
    versions: {
      schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
      samplingVersion: 'sampling-v1',
      relationshipVersion: 'complement-v1',
      deterministicEngineVersion: 'edge-v1',
      executionModelVersion: 'execution-v1',
      feeModelVersion: 'fee-v1',
      costModelVersion: 'cost-v1',
    },
    provenance: {
      dataSource: 'polymarket-clob',
      feedType: 'rest-orderbook',
      snapshotOrIncremental: 'SNAPSHOT',
      receivedTimestamp: 1_700_000_000_010,
      observationTimestamp: 1_700_000_000_020,
      dataDepth: 'FULL_DEPTH',
      quality: 'VALID',
      qualityReasons: [],
    },
    sampling: {
      group: 'CONTROL_LIQUID',
      discoveryReason: 'replay fixture',
      eligibilityChecks: [{ name: 'binary', passed: true }],
    },
    relationship: {
      type: 'COMPLEMENT',
      relatedInstrumentIds: ['yes', 'no'],
      assumptions: ['binary complement'],
      requiredInputs: ['yes-book', 'no-book'],
    },
    deterministic: {
      status: 'PASS',
      rejectionReasons: [],
      targetSize: 5,
      expectedNetProfit: 0.1,
      worstCaseNetProfit: 0.05,
      expectedNetEdgeBps: 200,
      worstCaseNetEdgeBps: 100,
      depthSummary: { known: true, sufficientForTarget: true },
    },
    execution: {
      atomicity: 'UNKNOWN',
      legCount: 2,
      partialFillRisk: 'UNKNOWN',
      hedgeCompletionStatus: 'UNKNOWN',
      accessibilityStatus: 'UNKNOWN',
    },
    classification: {
      opportunityClass: 'STRUCTURAL',
      finalPaperDecision: 'REVIEW',
      reasons: ['ACCESSIBILITY_NOT_VERIFIED'],
    },
    calibration: { persistence: [] },
  };
}

function envelope(): ReplayEnvelopeV1 {
  const normalized = observation();
  return {
    envelopeVersion: REPLAY_ENVELOPE_VERSION,
    observationId: normalized.observationId,
    capturedAt: 1_700_000_000_030,
    normalized,
    rawEvidence: [
      {
        kind: 'EMBEDDED_JSON',
        source: 'polymarket-clob',
        embeddedJson: {
          yesBook: { asks: [{ price: 0.44, size: 10 }] },
          noBook: { asks: [{ price: 0.53, size: 10 }] },
        },
      },
    ],
  };
}

describe('ReplayEnvelopeV1', () => {
  it('accepts replayable paper evidence', () => {
    expect(validateReplayEnvelope(envelope())).toEqual({ valid: true, reasons: [] });
  });

  it('requires observation identity to remain immutable', () => {
    const value = envelope();
    value.observationId = 'different-id';

    expect(validateReplayEnvelope(value).reasons).toContain('OBSERVATION_ID_MISMATCH');
  });

  it('fails closed when embedded raw evidence contains secret-like fields', () => {
    const value = envelope();
    value.rawEvidence = [{
      kind: 'EMBEDDED_JSON',
      source: 'bad-fixture',
      embeddedJson: { apiKey: 'should-never-be-recorded' },
    }];

    expect(validateReplayEnvelope(value).reasons).toContain('SECRET_LIKE_FIELD_IN_RAW_EVIDENCE');
    expect(() => replayEnvelopeToJsonl(value)).toThrow(/INVALID_REPLAY_ENVELOPE/);
  });

  it('requires content hashes for hash-based raw evidence references', () => {
    const value = envelope();
    value.rawEvidence = [{ kind: 'CONTENT_HASH', source: 'polymarket-clob' }];

    expect(validateReplayEnvelope(value).reasons).toContain('CONTENT_HASH_REQUIRED');
  });

  it('serializes a valid envelope for later replay', () => {
    const line = replayEnvelopeToJsonl(envelope());
    const parsed = JSON.parse(line);

    expect(parsed.envelopeVersion).toBe('replay-envelope-v1');
    expect(parsed.normalized.observationId).toBe('obs-replay-1');
  });
});
