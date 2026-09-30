import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_EVENT_SCHEMA_VERSION,
  type NormalizedEventV1,
  normalizedEventToJsonl,
  validateNormalizedEvent,
  validateRawEvidencePromotion,
} from './normalized-event.js';
import {
  RAW_EVIDENCE_SCHEMA_VERSION,
  type RawEvidenceEnvelopeV1,
} from './raw-evidence.js';

function rawMerge(): RawEvidenceEnvelopeV1 {
  return {
    schemaVersion: RAW_EVIDENCE_SCHEMA_VERSION,
    evidenceId: 'raw-merge-1',
    capturedAt: 1_700_000_000_100,
    source: {
      kind: 'CONTRACT_EVENT',
      name: 'fixture',
      chainId: 137,
      transactionHash: '0xmerge',
      logIndex: 1,
      sourceTimestamp: 1_700_000_000_000,
    },
    subject: {
      walletAddress: '0xwallet',
      conditionId: 'condition-1',
    },
    raw: {
      payload: '{"type":"MERGE","yes":"-11","no":"-11","usdc":"11"}',
      encoding: 'UTF8_JSON',
    },
    normalization: {
      status: 'SUPPORTED',
      normalizedEventType: 'MERGE',
      parserVersion: 'parser-v1',
      reasons: [],
    },
  };
}

function normalizedMerge(): NormalizedEventV1 {
  return {
    schemaVersion: NORMALIZED_EVENT_SCHEMA_VERSION,
    normalizedEventId: 'event-merge-1',
    rawEvidenceId: 'raw-merge-1',
    parserVersion: 'parser-v1',
    eventType: 'MERGE',
    occurredAt: 1_700_000_000_000,
    walletAddress: '0xwallet',
    conditionId: 'condition-1',
    transactionHash: '0xmerge',
    logIndex: 1,
    assetDeltas: [
      { assetId: 'YES', amount: -11, unit: 'SHARE' },
      { assetId: 'NO', amount: -11, unit: 'SHARE' },
    ],
    cashDeltas: [{ amount: 11, currency: 'USDC' }],
    accountingTreatment: 'TRADE_OR_PROTOCOL',
    notes: [],
  };
}

describe('NormalizedEventV1', () => {
  it('accepts a balanced-looking merge accounting event', () => {
    expect(validateNormalizedEvent(normalizedMerge())).toEqual({
      valid: true,
      reasons: [],
    });
  });

  it('promotes only supported raw evidence with matching identity/type/parser', () => {
    expect(
      validateRawEvidencePromotion(rawMerge(), normalizedMerge()),
    ).toEqual({ promotable: true, reasons: [] });
  });

  it('blocks unsupported raw evidence from normalization promotion', () => {
    const raw = rawMerge();
    raw.normalization = {
      status: 'UNSUPPORTED',
      reasons: ['UNKNOWN_EVENT_TYPE'],
    };

    expect(
      validateRawEvidencePromotion(raw, normalizedMerge()).reasons,
    ).toEqual(
      expect.arrayContaining([
        'RAW_EVIDENCE_NOT_PROMOTABLE',
        'RAW_EVIDENCE_NOT_SUPPORTED',
      ]),
    );
  });

  it('blocks parser or event-type drift from the preserved raw claim', () => {
    const event = normalizedMerge();
    event.parserVersion = 'parser-v2';
    event.eventType = 'REDEEM';

    expect(validateRawEvidencePromotion(rawMerge(), event).reasons).toEqual(
      expect.arrayContaining([
        'PARSER_VERSION_MISMATCH',
        'EVENT_TYPE_MISMATCH',
        'ACCOUNTING_TREATMENT_MISMATCH',
      ]),
    );
  });

  it('forces deposits and withdrawals to remain cash movement, not PnL', () => {
    const event: NormalizedEventV1 = {
      ...normalizedMerge(),
      normalizedEventId: 'deposit-1',
      eventType: 'DEPOSIT',
      assetDeltas: [],
      cashDeltas: [{ amount: 1000, currency: 'USDC' }],
      accountingTreatment: 'TRADE_OR_PROTOCOL',
    };

    expect(validateNormalizedEvent(event).reasons).toEqual(
      expect.arrayContaining([
        'ACCOUNTING_TREATMENT_MISMATCH',
        'CASH_MOVEMENT_CANNOT_BE_PNL',
      ]),
    );
  });

  it('rejects zero deltas so no-op rows cannot masquerade as ledger events', () => {
    const event = normalizedMerge();
    event.assetDeltas[0].amount = 0;
    expect(validateNormalizedEvent(event).reasons).toContain(
      'INVALID_ASSET_DELTA',
    );
  });

  it('fails serialization closed for malformed normalized evidence', () => {
    const event = normalizedMerge();
    event.rawEvidenceId = '';
    expect(() => normalizedEventToJsonl(event)).toThrow(
      /INVALID_NORMALIZED_EVENT:MISSING_RAW_EVIDENCE_ID/,
    );
  });
});
