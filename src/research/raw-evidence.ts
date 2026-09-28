/**
 * Phase 5.1 lossless evidence envelope.
 *
 * Scientific rule:
 *   UnknownEvent !== IgnoreEvent
 *
 * This module preserves the original provider payload and provenance before any
 * normalization, ledger reconstruction, PnL attribution, or model analysis.
 *
 * Hashes prove content integrity only. They do NOT prove source authenticity.
 * Paper/research infrastructure only; no signer, wallet, broker, or order code.
 */
export const RAW_EVIDENCE_SCHEMA_VERSION = 'raw-evidence-v1' as const;

export type EvidenceSourceKind =
  | 'POLYMARKET_DATA_API'
  | 'POLYMARKET_CLOB'
  | 'POLYGON_RPC'
  | 'CONTRACT_EVENT'
  | 'OTHER';

export type EvidenceNormalizationStatus =
  | 'SUPPORTED'
  | 'UNSUPPORTED'
  | 'MALFORMED'
  | 'NOT_ATTEMPTED';

export interface RawEvidenceEnvelopeV1 {
  schemaVersion: typeof RAW_EVIDENCE_SCHEMA_VERSION;
  evidenceId: string;
  capturedAt: number;
  source: {
    kind: EvidenceSourceKind;
    name: string;
    endpointOrContract?: string;
    sourceVersion?: string;
    chainId?: number;
    blockNumber?: number;
    transactionHash?: string;
    logIndex?: number;
    sourceTimestamp?: number;
  };
  subject: {
    walletAddress?: string;
    marketId?: string;
    conditionId?: string;
    tokenId?: string;
  };
  raw: {
    /** Exact provider response/event representation as captured by the collector. */
    payload: string;
    encoding: 'UTF8_JSON' | 'UTF8_TEXT' | 'HEX';
    /** Optional external/computed digest. Validator checks shape only. */
    sha256?: string;
  };
  normalization: {
    status: EvidenceNormalizationStatus;
    normalizedEventType?: string;
    parserVersion?: string;
    reasons: string[];
  };
}

export interface RawEvidenceValidation {
  valid: boolean;
  reasons: string[];
  pnlProofEligible: boolean;
}

const finiteNonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

const isSha256 = (value: string): boolean => /^[a-fA-F0-9]{64}$/.test(value);

export function validateRawEvidence(
  evidence: RawEvidenceEnvelopeV1,
): RawEvidenceValidation {
  const reasons: string[] = [];

  if (evidence.schemaVersion !== RAW_EVIDENCE_SCHEMA_VERSION) {
    reasons.push('INVALID_SCHEMA_VERSION');
  }
  if (!evidence.evidenceId.trim()) reasons.push('MISSING_EVIDENCE_ID');
  if (!finiteNonNegative(evidence.capturedAt) || evidence.capturedAt === 0) {
    reasons.push('INVALID_CAPTURE_TIME');
  }
  if (!evidence.source.name.trim()) reasons.push('MISSING_SOURCE_NAME');
  if (!evidence.raw.payload.length) reasons.push('MISSING_RAW_PAYLOAD');
  if (evidence.raw.sha256 !== undefined && !isSha256(evidence.raw.sha256)) {
    reasons.push('INVALID_SHA256');
  }

  const source = evidence.source;
  for (const [name, value] of [
    ['chainId', source.chainId],
    ['blockNumber', source.blockNumber],
    ['logIndex', source.logIndex],
    ['sourceTimestamp', source.sourceTimestamp],
  ] as const) {
    if (value !== undefined && !finiteNonNegative(value)) {
      reasons.push(`INVALID_${name.toUpperCase()}`);
    }
  }

  const n = evidence.normalization;
  if (n.status === 'SUPPORTED') {
    if (!n.normalizedEventType?.trim()) {
      reasons.push('SUPPORTED_REQUIRES_EVENT_TYPE');
    }
    if (!n.parserVersion?.trim()) {
      reasons.push('SUPPORTED_REQUIRES_PARSER_VERSION');
    }
  }

  if (n.status === 'UNSUPPORTED' && n.reasons.length === 0) {
    reasons.push('UNSUPPORTED_REQUIRES_REASON');
  }

  if (n.status === 'MALFORMED' && n.reasons.length === 0) {
    reasons.push('MALFORMED_REQUIRES_REASON');
  }

  const valid = reasons.length === 0;
  const pnlProofEligible =
    valid &&
    n.status === 'SUPPORTED' &&
    Boolean(n.normalizedEventType?.trim()) &&
    Boolean(n.parserVersion?.trim());

  return { valid, reasons: [...new Set(reasons)], pnlProofEligible };
}

export function rawEvidenceToJsonl(evidence: RawEvidenceEnvelopeV1): string {
  const validation = validateRawEvidence(evidence);
  if (!validation.valid) {
    throw new Error(
      'INVALID_RAW_EVIDENCE:' + validation.reasons.join(','),
    );
  }
  return JSON.stringify(evidence);
}
