import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_EVENT_SCHEMA_VERSION,
  type NormalizedEventV1,
} from './normalized-event.js';
import { replayTokenLedger } from './token-ledger.js';

function mergeEvent(id = 'merge-1'): NormalizedEventV1 {
  return {
    schemaVersion: NORMALIZED_EVENT_SCHEMA_VERSION,
    normalizedEventId: id,
    rawEvidenceId: 'raw-' + id,
    parserVersion: 'parser-v1',
    eventType: 'MERGE',
    assetDeltas: [
      { assetId: 'YES', amount: -11, unit: 'SHARE' },
      { assetId: 'NO', amount: -11, unit: 'SHARE' },
    ],
    cashDeltas: [{ amount: 11, currency: 'USDC' }],
    accountingTreatment: 'TRADE_OR_PROTOCOL',
    notes: [],
  };
}

describe('TokenLedger replay', () => {
  it('replays a merge from explicit opening inventory', () => {
    const result = replayTokenLedger({
      openingBalances: [
        { assetId: 'YES', amount: 11, unit: 'SHARE' },
        { assetId: 'NO', amount: 11, unit: 'SHARE' },
      ],
      events: [mergeEvent()],
    });

    expect(result.valid).toBe(true);
    expect(result.closingBalances).toEqual([
      { assetId: 'NO', amount: 0, unit: 'SHARE' },
      { assetId: 'YES', amount: 0, unit: 'SHARE' },
    ]);
  });

  it('accumulates multiple deltas deterministically', () => {
    const first = mergeEvent('merge-1');
    const second = mergeEvent('merge-2');
    first.assetDeltas = [{ assetId: 'YES', amount: 4, unit: 'SHARE' }];
    first.cashDeltas = [];
    first.eventType = 'OTHER_SUPPORTED';
    first.accountingTreatment = 'UNKNOWN';
    second.assetDeltas = [{ assetId: 'YES', amount: -1.5, unit: 'SHARE' }];
    second.cashDeltas = [];
    second.eventType = 'OTHER_SUPPORTED';
    second.accountingTreatment = 'UNKNOWN';

    const result = replayTokenLedger({ events: [first, second] });
    expect(result.closingBalances).toEqual([
      { assetId: 'YES', amount: 2.5, unit: 'SHARE' },
    ]);
  });

  it('fails closed on duplicate event ids instead of double counting', () => {
    const event = mergeEvent();
    const result = replayTokenLedger({
      openingBalances: [
        { assetId: 'YES', amount: 22, unit: 'SHARE' },
        { assetId: 'NO', amount: 22, unit: 'SHARE' },
      ],
      events: [event, event],
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('DUPLICATE_NORMALIZED_EVENT_ID');
    expect(result.appliedEventIds).toEqual(['merge-1']);
  });

  it('rejects invalid normalized events before applying deltas', () => {
    const event = mergeEvent();
    event.rawEvidenceId = '';

    const result = replayTokenLedger({ events: [event] });
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('INVALID_NORMALIZED_EVENT');
    expect(result.closingBalances).toEqual([]);
  });

  it('keeps asset unit in the identity so unlike balances never merge', () => {
    const event = mergeEvent();
    event.eventType = 'OTHER_SUPPORTED';
    event.accountingTreatment = 'UNKNOWN';
    event.cashDeltas = [];
    event.assetDeltas = [
      { assetId: 'ABC', amount: 2, unit: 'TOKEN' },
      { assetId: 'ABC', amount: 3, unit: 'SHARE' },
    ];

    const result = replayTokenLedger({ events: [event] });
    expect(result.closingBalances).toEqual([
      { assetId: 'ABC', amount: 3, unit: 'SHARE' },
      { assetId: 'ABC', amount: 2, unit: 'TOKEN' },
    ]);
  });
});
