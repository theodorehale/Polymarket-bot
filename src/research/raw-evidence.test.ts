import { describe, expect, it } from 'vitest';
import {
  RAW_EVIDENCE_SCHEMA_VERSION,
  type RawEvidenceEnvelopeV1,
  rawEvidenceToJsonl,
  validateRawEvidence,
} from './raw-evidence.js';

function validEvidence(): RawEvidenceEnvelopeV1 {
  return {
    schemaVersion: RAW_EVIDENCE_SCHEMA_VERSION,
    evidenceId: 'evidence-1',
    capturedAt: 1_700_000_000_100,
    source: {
      kind: 'CONTRACT_EVENT',
      name: 'fixture',
      chainId: 137,
      blockNumber: 50_000_000,
      transactionHash: '0xabc',
      logIndex: 3,
      sourceTimestamp: 1_700_000_000_000,
    },
    subject: {
      walletAddress: '0xwallet',
      conditionId: 'condition-1',
    },
    raw: {
      payload: '{"type":"MERGE","amount":"11"}',
      encoding: 'UTF8_JSON',
      sha256: 'a'.repeat(64),
    },
    normalization: {
      status: 'SUPPORTED',
      normalizedEventType: 'MERGE',
      parserVersion: 'parser-v1',
      reasons: [],
    },
  };
}

describe('RawEvidenceEnvelopeV1', () => {
  it('accepts a supported event with preserved raw payload', () => {
    expect(validateRawEvidence(validEvidence())).toEqual({
      valid: true,
      reasons: [],
      pnlProofEligible: true,
    });
  });

  it('preserves unsupported events but blocks them from PnL proof', () => {
    const evidence = validEvidence();
    evidence.raw.payload = '{"type":"NEW_PROVIDER_EVENT","value":"x"}';
    evidence.normalization = {
      status: 'UNSUPPORTED',
      reasons: ['UNKNOWN_EVENT_TYPE'],
    };

    expect(validateRawEvidence(evidence)).toEqual({
      valid: true,
      reasons: [],
      pnlProofEligible: false,
    });
    expect(rawEvidenceToJsonl(evidence)).toContain('NEW_PROVIDER_EVENT');
  });

  it('rejects silently unsupported evidence with no reason', () => {
    const evidence = validEvidence();
    evidence.normalization = { status: 'UNSUPPORTED', reasons: [] };
    expect(validateRawEvidence(evidence).reasons).toContain(
      'UNSUPPORTED_REQUIRES_REASON',
    );
  });

  it('requires event type and parser version before PnL proof eligibility', () => {
    const evidence = validEvidence();
    evidence.normalization = {
      status: 'SUPPORTED',
      reasons: [],
    };
    expect(validateRawEvidence(evidence).reasons).toEqual(
      expect.arrayContaining([
        'SUPPORTED_REQUIRES_EVENT_TYPE',
        'SUPPORTED_REQUIRES_PARSER_VERSION',
      ]),
    );
  });

  it('rejects an invalid digest rather than trusting it', () => {
    const evidence = validEvidence();
    evidence.raw.sha256 = 'not-a-sha256';
    expect(validateRawEvidence(evidence).reasons).toContain('INVALID_SHA256');
  });

  it('fails serialization closed when raw evidence is missing', () => {
    const evidence = validEvidence();
    evidence.raw.payload = '';
    expect(() => rawEvidenceToJsonl(evidence)).toThrow(
      /INVALID_RAW_EVIDENCE:MISSING_RAW_PAYLOAD/,
    );
  });
});
