import type { PaperExecutionAttempt } from './types.js';

/**
 * Paper-only binary settlement ledger. This module never submits orders and
 * never treats an unverified resolution input as independent evidence.
 */
export interface PaperSettlementEvidence {
  marketId: string;
  winningTokenId: string;
  settledAtMs: number;
  sourceUrl: string;
  sourceSha256: string;
  final: boolean;
}

export interface PaperLedgerCosts {
  /** This formula is for the international Polymarket crypto taker schedule ONLY. */
  venue: 'POLYMARKET_GLOBAL';
  feeCategory: 'CRYPTO_TAKER';
  feeScheduleVersion: string;
  feeCoefficient: number;
  /** Explicit additional USD cost assumption; 0 must be consciously supplied. */
  additionalCostsUsd: number;
}

export type PaperLedgerStatus = 'NOT_TRADED' | 'NOT_EVALUABLE' | 'PAPER_SETTLED_ESTIMATE';

export interface PaperLedgerRow {
  schemaVersion: 'hale-5m-paper-ledger-v0.1';
  attemptId: string;
  marketId: string;
  tokenId: string;
  status: PaperLedgerStatus;
  reason: string;
  evidenceLevel: 'INPUT_NOT_INDEPENDENTLY_VERIFIED';
  shares?: number;
  executionVwap?: number;
  cashSpentUsd?: number;
  feeEstimateUsd?: number;
  additionalCostsUsd?: number;
  settlementPayoutUsd?: number;
  simulatedNetPnlUsd?: number;
  settlementSourceUrl?: string;
  settlementSourceSha256?: string;
  feeScheduleVersion?: string;
}

const isNonnegative = (v: number): boolean => Number.isFinite(v) && v >= 0;
const sha256 = /^[a-f0-9]{64}$/i;

export function reconcilePaperSettlement(
  attempt: PaperExecutionAttempt,
  settlement?: PaperSettlementEvidence,
  costs?: PaperLedgerCosts,
): PaperLedgerRow {
  const base: PaperLedgerRow = {
    schemaVersion: 'hale-5m-paper-ledger-v0.1',
    attemptId: attempt.attemptId,
    marketId: attempt.marketId,
    tokenId: attempt.tokenId,
    status: 'NOT_EVALUABLE',
    reason: 'UNKNOWN',
    evidenceLevel: 'INPUT_NOT_INDEPENDENTLY_VERIFIED',
  };
  if (attempt.status !== 'PAPER_FILLED') {
    return { ...base, status: 'NOT_TRADED', reason: attempt.reason };
  }
  if (attempt.side !== 'BUY') {
    return { ...base, reason: 'SELL_REQUIRES_VERIFIED_INVENTORY_COST_BASIS' };
  }
  const shares = attempt.executableSize;
  const price = attempt.executablePrice;
  if (shares === undefined || !Number.isFinite(shares) || shares <= 0 ||
      price === undefined || !Number.isFinite(price) || price <= 0 || price >= 1 ||
      shares > attempt.requestedSize || attempt.requestedSize <= 0) {
    return { ...base, reason: 'INVALID_PAPER_FILL' };
  }
  if (!costs || costs.venue !== 'POLYMARKET_GLOBAL' ||
      costs.feeCategory !== 'CRYPTO_TAKER' ||
      !costs.feeScheduleVersion.trim() ||
      !isNonnegative(costs.feeCoefficient) || costs.feeCoefficient > 1 ||
      !isNonnegative(costs.additionalCostsUsd)) {
    return { ...base, reason: 'MISSING_OR_UNSUPPORTED_EXPLICIT_FEE_MODEL' };
  }
  if (!settlement || !settlement.final ||
      settlement.marketId !== attempt.marketId ||
      !settlement.winningTokenId ||
      !Number.isFinite(settlement.settledAtMs) ||
      settlement.settledAtMs < attempt.hypotheticalArrivalAtMs ||
      !/^https:\/\//.test(settlement.sourceUrl) ||
      !sha256.test(settlement.sourceSha256)) {
    return { ...base, reason: 'MISSING_OR_INVALID_FINAL_SETTLEMENT_EVIDENCE' };
  }
  const feeEstimateUsd = shares * costs.feeCoefficient * price * (1 - price);
  const cashSpentUsd = shares * price;
  const settlementPayoutUsd = settlement.winningTokenId === attempt.tokenId ? shares : 0;
  return {
    ...base,
    status: 'PAPER_SETTLED_ESTIMATE',
    reason: 'PAPER_ONLY_RESOLUTION_INPUT_NOT_INDEPENDENTLY_VERIFIED',
    shares,
    executionVwap: price,
    cashSpentUsd,
    feeEstimateUsd,
    additionalCostsUsd: costs.additionalCostsUsd,
    settlementPayoutUsd,
    simulatedNetPnlUsd: settlementPayoutUsd - cashSpentUsd - feeEstimateUsd - costs.additionalCostsUsd,
    settlementSourceUrl: settlement.sourceUrl,
    settlementSourceSha256: settlement.sourceSha256,
    feeScheduleVersion: costs.feeScheduleVersion,
  };
}
