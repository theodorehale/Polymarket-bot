import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_EVENT_SCHEMA_VERSION,
  type NormalizedEventV1,
} from './normalized-event.js';
import { reconcileLedgers } from './reconciler.js';

function mergeEvent(): NormalizedEventV1 {
  return {
    schemaVersion: NORMALIZED_EVENT_SCHEMA_VERSION,
    normalizedEventId: 'merge-1',
    rawEvidenceId: 'raw-merge-1',
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

describe('Ledger reconciler', () => {
  it('reconciles a merge when observed balances match replay', () => {
    const result = reconcileLedgers({
      openingTokenBalances: [
        { assetId: 'YES', amount: 11, unit: 'SHARE' },
        { assetId: 'NO', amount: 11, unit: 'SHARE' },
      ],
      openingCashBalances: [{ currency: 'USDC', amount: 0 }],
      events: [mergeEvent()],
      observedClosingTokenBalances: [
        { assetId: 'YES', amount: 0, unit: 'SHARE' },
        { assetId: 'NO', amount: 0, unit: 'SHARE' },
      ],
      observedClosingCashBalances: [{ currency: 'USDC', amount: 11 }],
      tolerance: { tokenAbsolute: 0, cashAbsoluteByCurrency: { USDC: 0 } },
    });

    expect(result.valid).toBe(true);
    expect(result.reconciled).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('fails reconciliation when a hidden token residual remains', () => {
    const result = reconcileLedgers({
      openingTokenBalances: [
        { assetId: 'YES', amount: 11, unit: 'SHARE' },
        { assetId: 'NO', amount: 11, unit: 'SHARE' },
      ],
      events: [mergeEvent()],
      observedClosingTokenBalances: [
        { assetId: 'YES', amount: 1, unit: 'SHARE' },
        { assetId: 'NO', amount: 0, unit: 'SHARE' },
      ],
      observedClosingCashBalances: [{ currency: 'USDC', amount: 11 }],
      tolerance: { tokenAbsolute: 0, cashAbsoluteByCurrency: { USDC: 0 } },
    });

    expect(result.reconciled).toBe(false);
    expect(result.reasons).toContain('TOKEN_RESIDUAL_EXCEEDS_TOLERANCE');
  });

  it('fails reconciliation when cash differs beyond predeclared tolerance', () => {
    const result = reconcileLedgers({
      openingTokenBalances: [
        { assetId: 'YES', amount: 11, unit: 'SHARE' },
        { assetId: 'NO', amount: 11, unit: 'SHARE' },
      ],
      events: [mergeEvent()],
      observedClosingTokenBalances: [
        { assetId: 'YES', amount: 0, unit: 'SHARE' },
        { assetId: 'NO', amount: 0, unit: 'SHARE' },
      ],
      observedClosingCashBalances: [{ currency: 'USDC', amount: 10.98 }],
      tolerance: { tokenAbsolute: 0, cashAbsoluteByCurrency: { USDC: 0.01 } },
    });

    expect(result.reconciled).toBe(false);
    expect(result.reasons).toContain('CASH_RESIDUAL_EXCEEDS_TOLERANCE');
  });

  it('accepts residuals only when within the declared tolerance', () => {
    const result = reconcileLedgers({
      openingTokenBalances: [
        { assetId: 'YES', amount: 11, unit: 'SHARE' },
        { assetId: 'NO', amount: 11, unit: 'SHARE' },
      ],
      events: [mergeEvent()],
      observedClosingTokenBalances: [
        { assetId: 'YES', amount: 0.0001, unit: 'SHARE' },
        { assetId: 'NO', amount: 0, unit: 'SHARE' },
      ],
      observedClosingCashBalances: [{ currency: 'USDC', amount: 10.995 }],
      tolerance: { tokenAbsolute: 0.001, cashAbsoluteByCurrency: { USDC: 0.01 } },
    });

    expect(result.reconciled).toBe(true);
  });

  it('rejects invalid tolerance policy', () => {
    const result = reconcileLedgers({
      events: [],
      observedClosingTokenBalances: [],
      observedClosingCashBalances: [],
      tolerance: { tokenAbsolute: -1, cashAbsoluteByCurrency: { USDC: -1 } },
    });

    expect(result.valid).toBe(false);
    expect(result.reconciled).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'INVALID_TOKEN_TOLERANCE',
        'INVALID_CASH_TOLERANCE',
      ]),
    );
  });
});
