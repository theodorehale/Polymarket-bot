/**
 * Phase 5.1 venue-agnostic accounting event.
 *
 * Scientific rules:
 * - Normalization is downstream of preserved RawEvidence.
 * - Unsupported / malformed / not-attempted evidence cannot be promoted.
 * - Deposit / withdrawal are cash movements, not PnL.
 * - Accounting movements are recorded before strategy interpretation.
 * - This module contains no signer, wallet, broker, or order capability.
 */
import {
  type RawEvidenceEnvelopeV1,
  validateRawEvidence,
} from './raw-evidence.js';

export const NORMALIZED_EVENT_SCHEMA_VERSION = 'normalized-event-v1' as const;

export type NormalizedEventType =
  | 'TRADE'
  | 'SPLIT'
  | 'MERGE'
  | 'REDEEM'
  | 'CONVERSION'
  | 'MIGRATION'
  | 'REWARD'
  | 'REBATE'
  | 'YIELD'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER'
  | 'FEE'
  | 'OTHER_SUPPORTED';

export type AccountingTreatment =
  | 'TRADE_OR_PROTOCOL'
  | 'CASH_MOVEMENT_ONLY'
  | 'INVENTORY_MOVEMENT_ONLY'
  | 'INCENTIVE'
  | 'FEE'
  | 'UNKNOWN';

export interface AssetDelta {
  assetId: string;
  amount: number;
  unit: 'TOKEN' | 'COLLATERAL' | 'SHARE' | 'OTHER';
}

export interface CashDelta {
  amount: number;
  currency: string;
}

export interface NormalizedEventV1 {
  schemaVersion: typeof NORMALIZED_EVENT_SCHEMA_VERSION;
  normalizedEventId: string;
  rawEvidenceId: string;
  parserVersion: string;
  eventType: NormalizedEventType;
  occurredAt?: number;
  walletAddress?: string;
  marketId?: string;
  conditionId?: string;
  transactionHash?: string;
  logIndex?: number;

  /**
   * Signed changes from this event, from the wallet/account perspective.
   * Positive = inflow; negative = outflow.
   */
  assetDeltas: AssetDelta[];
  cashDeltas: CashDelta[];

  accountingTreatment: AccountingTreatment;
  notes: string[];
}

export interface NormalizedEventValidation {
  valid: boolean;
  reasons: string[];
}

const finite = (value: number): boolean => Number.isFinite(value);
const finiteNonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

export function expectedAccountingTreatment(
  eventType: NormalizedEventType,
): AccountingTreatment {
  switch (eventType) {
    case 'DEPOSIT':
    case 'WITHDRAWAL':
      return 'CASH_MOVEMENT_ONLY';
    case 'TRANSFER':
    case 'MIGRATION':
      return 'INVENTORY_MOVEMENT_ONLY';
    case 'REWARD':
    case 'REBATE':
    case 'YIELD':
      return 'INCENTIVE';
    case 'FEE':
      return 'FEE';
    case 'TRADE':
    case 'SPLIT':
    case 'MERGE':
    case 'REDEEM':
    case 'CONVERSION':
      return 'TRADE_OR_PROTOCOL';
    case 'OTHER_SUPPORTED':
      return 'UNKNOWN';
  }
}

export function validateNormalizedEvent(
  event: NormalizedEventV1,
): NormalizedEventValidation {
  const reasons: string[] = [];

  if (event.schemaVersion !== NORMALIZED_EVENT_SCHEMA_VERSION) {
    reasons.push('INVALID_SCHEMA_VERSION');
  }
  if (!event.normalizedEventId.trim()) reasons.push('MISSING_NORMALIZED_EVENT_ID');
  if (!event.rawEvidenceId.trim()) reasons.push('MISSING_RAW_EVIDENCE_ID');
  if (!event.parserVersion.trim()) reasons.push('MISSING_PARSER_VERSION');

  if (event.occurredAt !== undefined && !finiteNonNegative(event.occurredAt)) {
    reasons.push('INVALID_OCCURRED_AT');
  }
  if (event.logIndex !== undefined && !finiteNonNegative(event.logIndex)) {
    reasons.push('INVALID_LOG_INDEX');
  }

  for (const delta of event.assetDeltas) {
    if (!delta.assetId.trim()) reasons.push('MISSING_ASSET_ID');
    if (!finite(delta.amount) || delta.amount === 0) {
      reasons.push('INVALID_ASSET_DELTA');
    }
  }

  for (const delta of event.cashDeltas) {
    if (!finite(delta.amount) || delta.amount === 0) {
      reasons.push('INVALID_CASH_DELTA');
    }
    if (!delta.currency.trim()) reasons.push('MISSING_CASH_CURRENCY');
  }

  const expected = expectedAccountingTreatment(event.eventType);
  if (
    event.eventType !== 'OTHER_SUPPORTED' &&
    event.accountingTreatment !== expected
  ) {
    reasons.push('ACCOUNTING_TREATMENT_MISMATCH');
  }

  if (
    (event.eventType === 'DEPOSIT' || event.eventType === 'WITHDRAWAL') &&
    event.accountingTreatment !== 'CASH_MOVEMENT_ONLY'
  ) {
    reasons.push('CASH_MOVEMENT_CANNOT_BE_PNL');
  }

  if (
    event.assetDeltas.length === 0 &&
    event.cashDeltas.length === 0 &&
    event.eventType !== 'OTHER_SUPPORTED'
  ) {
    reasons.push('EVENT_HAS_NO_ACCOUNTING_EFFECT');
  }

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export interface PromotionValidation {
  promotable: boolean;
  reasons: string[];
}

/**
 * Gate from RawEvidence to NormalizedEvent.
 * This does not parse provider payloads. It only proves that a candidate
 * normalized event is allowed to claim provenance from the supplied evidence.
 */
export function validateRawEvidencePromotion(
  raw: RawEvidenceEnvelopeV1,
  event: NormalizedEventV1,
): PromotionValidation {
  const reasons: string[] = [];
  const rawValidation = validateRawEvidence(raw);
  const normalizedValidation = validateNormalizedEvent(event);

  if (!rawValidation.valid) reasons.push('RAW_EVIDENCE_INVALID');
  if (!rawValidation.pnlProofEligible) reasons.push('RAW_EVIDENCE_NOT_PROMOTABLE');
  if (!normalizedValidation.valid) reasons.push('NORMALIZED_EVENT_INVALID');

  if (event.rawEvidenceId !== raw.evidenceId) {
    reasons.push('RAW_EVIDENCE_ID_MISMATCH');
  }

  if (raw.normalization.status !== 'SUPPORTED') {
    reasons.push('RAW_EVIDENCE_NOT_SUPPORTED');
  }

  if (
    raw.normalization.parserVersion &&
    event.parserVersion !== raw.normalization.parserVersion
  ) {
    reasons.push('PARSER_VERSION_MISMATCH');
  }

  if (
    raw.normalization.normalizedEventType &&
    event.eventType !== raw.normalization.normalizedEventType
  ) {
    reasons.push('EVENT_TYPE_MISMATCH');
  }

  return { promotable: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function normalizedEventToJsonl(event: NormalizedEventV1): string {
  const validation = validateNormalizedEvent(event);
  if (!validation.valid) {
    throw new Error(
      'INVALID_NORMALIZED_EVENT:' + validation.reasons.join(','),
    );
  }
  return JSON.stringify(event);
}
