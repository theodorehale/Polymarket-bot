import { describe, expect, it } from 'vitest';
import { reconcilePaperSettlement } from './paper-settlement-ledger.js';
import type { PaperExecutionAttempt } from './types.js';

const fill: PaperExecutionAttempt = {
  schemaVersion: 'hale-5m-paper-attempt-v0.1',
  attemptId: 'synthetic-1',
  marketId: 'synthetic-market',
  tokenId: 'synthetic-up',
  signalReceivedAtMs: 1000,
  hypotheticalArrivalAtMs: 1100,
  configuredLatencyMs: 100,
  side: 'BUY',
  requestedSize: 10,
  referencePrice: 0.6,
  executablePrice: 0.4,
  executableSize: 10,
  estimatedFees: 0, // Existing simulator fee field is intentionally NOT trusted.
  status: 'PAPER_FILLED',
  reason: 'SYNTHETIC_FILL',
};
const settlement = {
  marketId: 'synthetic-market',
  winningTokenId: 'synthetic-up',
  settledAtMs: 301000,
  sourceUrl: 'https://example.org/synthetic-settlement',
  sourceSha256: 'a'.repeat(64),
  final: true,
};
const costs = {
  venue: 'POLYMARKET_GLOBAL' as const,
  feeCategory: 'CRYPTO_TAKER' as const,
  feeScheduleVersion: 'SYNTHETIC_GLOBAL_CRYPTO_0.07',
  feeCoefficient: 0.07,
  additionalCostsUsd: 0,
};

describe('reconcilePaperSettlement (SYNTHETIC ONLY)', () => {
  it('computes winning binary payout, price cost and nonlinear taker fee', () => {
    const row = reconcilePaperSettlement(fill, settlement, costs);
    expect(row.status).toBe('PAPER_SETTLED_ESTIMATE');
    expect(row.cashSpentUsd).toBeCloseTo(4);
    expect(row.feeEstimateUsd).toBeCloseTo(0.168);
    expect(row.settlementPayoutUsd).toBe(10);
    expect(row.simulatedNetPnlUsd).toBeCloseTo(5.832);
    expect(row.evidenceLevel).toBe('INPUT_NOT_INDEPENDENTLY_VERIFIED');
  });
  it('accounts for a losing binary token and additional costs', () => {
    const row = reconcilePaperSettlement(fill, { ...settlement, winningTokenId: 'synthetic-down' }, { ...costs, additionalCostsUsd: 0.1 });
    expect(row.settlementPayoutUsd).toBe(0);
    expect(row.simulatedNetPnlUsd).toBeCloseTo(-4.268);
  });
  it('never fabricates settlement PnL when resolution is missing', () => {
    const row = reconcilePaperSettlement(fill, undefined, costs);
    expect(row.status).toBe('NOT_EVALUABLE');
    expect(row.simulatedNetPnlUsd).toBeUndefined();
  });
  it('rejects wrong market, non-final and missing provenance', () => {
    for (const s of [
      { ...settlement, marketId: 'other-market' },
      { ...settlement, final: false },
      { ...settlement, sourceSha256: '' },
    ]) {
      expect(reconcilePaperSettlement(fill, s, costs).status).toBe('NOT_EVALUABLE');
    }
  });
  it('requires an explicit supported fee schedule and costs', () => {
    expect(reconcilePaperSettlement(fill, settlement).reason).toBe('MISSING_OR_UNSUPPORTED_EXPLICIT_FEE_MODEL');
    expect(reconcilePaperSettlement(fill, settlement, { ...costs, feeCoefficient: -1 }).status).toBe('NOT_EVALUABLE');
  });
  it('does not count rejected and missed orders as trades', () => {
    const row = reconcilePaperSettlement({ ...fill, status: 'PAPER_MISSED', reason: 'NO_ARRIVAL_BOOK' }, settlement, costs);
    expect(row.status).toBe('NOT_TRADED');
    expect(row.simulatedNetPnlUsd).toBeUndefined();
  });
  it('fails closed on sell orders without inventory basis and invalid fills', () => {
    expect(reconcilePaperSettlement({ ...fill, side: 'SELL' }, settlement, costs).status).toBe('NOT_EVALUABLE');
    expect(reconcilePaperSettlement({ ...fill, executableSize: 20 }, settlement, costs).status).toBe('NOT_EVALUABLE');
  });
});
