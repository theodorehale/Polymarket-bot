/**
 * Architecture Freeze v1 foundation types.
 *
 * Market-agnostic research schema for paper-only opportunity observations.
 * This file intentionally contains no network, wallet, signer, broker, or order code.
 */

export const UNIVERSAL_OBSERVATION_SCHEMA_VERSION = 'universal-observation-v1' as const;

export type MarketType = 'PREDICTION' | 'FUTURES' | 'OPTIONS' | 'ETF' | 'OTHER';
export type SamplingGroup =
  | 'CONTROL_RANDOM'
  | 'CONTROL_LIQUID'
  | 'DETERMINISTIC_CANDIDATE'
  | 'JEV_REVIEW'
  | 'JEV_ACCEPT';

export type DataQualityStatus =
  | 'VALID'
  | 'STALE'
  | 'SKEWED'
  | 'PARTIAL'
  | 'MALFORMED'
  | 'UNSUPPORTED'
  | 'SOURCE_UNAVAILABLE';

export type OpportunityClass = 'STRUCTURAL' | 'RELATIVE_VALUE' | 'SEMANTIC' | 'NONE';
export type AccessibilityStatus = 'ACCESSIBLE' | 'RESTRICTED' | 'INSTITUTIONAL_ONLY' | 'UNKNOWN';
export type DeterministicStatus = 'PASS' | 'REJECT';
export type PaperDecision = 'ACCEPT' | 'REVIEW' | 'REJECT' | 'JEV_UNAVAILABLE';

export interface VersionMetadata {
  schemaVersion: typeof UNIVERSAL_OBSERVATION_SCHEMA_VERSION;
  samplingVersion: string;
  relationshipVersion: string;
  deterministicEngineVersion: string;
  executionModelVersion: string;
  feeModelVersion: string;
  costModelVersion: string;
  promptVersion?: string;
}

export interface DataProvenance {
  dataSource: string;
  feedType: string;
  snapshotOrIncremental: 'SNAPSHOT' | 'INCREMENTAL' | 'UNKNOWN';
  sourceTimestamp?: number;
  receivedTimestamp: number;
  observationTimestamp: number;
  dataDepth: 'TOP_OF_BOOK' | 'FULL_DEPTH' | 'PARTIAL_DEPTH' | 'UNKNOWN';
  sourceVersion?: string;
  quality: DataQualityStatus;
  qualityReasons: string[];
}

export interface SamplingMetadata {
  group: SamplingGroup;
  discoveryReason: string;
  eligibilityChecks: Array<{
    name: string;
    passed: boolean;
    reason?: string;
  }>;
  randomizationSeed?: string;
}

export interface RelationshipMetadata {
  type:
    | 'COMPLEMENT'
    | 'PARITY'
    | 'REPLICATION'
    | 'HEDGE'
    | 'CARRY'
    | 'CONVERSION'
    | 'CONDITIONAL_PROBABILITY'
    | 'SEMANTIC_DEPENDENCY'
    | 'STATISTICAL';
  relatedInstrumentIds: string[];
  assumptions: string[];
  requiredInputs: string[];
}

export interface DeterministicEvidence {
  status: DeterministicStatus;
  rejectionReasons: string[];
  targetSize: number;
  expectedGrossProfit?: number;
  worstCaseGrossProfit?: number;
  expectedNetProfit?: number;
  worstCaseNetProfit?: number;
  expectedNetEdgeBps?: number;
  worstCaseNetEdgeBps?: number;
  fees?: number;
  slippage?: number;
  financingCosts?: number;
  otherCosts?: number;
  freshness?: {
    maxObservedAgeMs?: number;
    skewMs?: number;
  };
  depthSummary?: {
    known: boolean;
    sufficientForTarget?: boolean;
  };
}

export interface ExecutionSimulation {
  atomicity: 'ATOMIC' | 'NON_ATOMIC' | 'UNKNOWN';
  legCount: number;
  estimatedLatencyMs?: number;
  partialFillRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  hedgeCompletionStatus: 'NOT_REQUIRED' | 'COMPLETE' | 'INCOMPLETE' | 'UNKNOWN';
  capitalRequired?: number;
  marginRequired?: number;
  accessibilityStatus: AccessibilityStatus;
}

export interface JevEvidence {
  promptVersion: string;
  acceptThreshold: number;
  startedAt: number;
  completedAt: number;
  latencyMs: number;
  probability?: number;
  status: PaperDecision;
  error?: string;
  vendorMetadata?: Record<string, string | number | boolean | null>;
}

export interface EdgePersistencePoint {
  horizonMs: number;
  checkedAt: number;
  stillCandidate: boolean;
  expectedNetEdgeBps?: number;
  worstCaseNetEdgeBps?: number;
  invalidationReason?: string;
}

export interface CalibrationMetadata {
  persistence: EdgePersistencePoint[];
  laterOutcome?: string;
  calibrationLabel?: string;
}

export interface UniversalObservationV1 {
  schemaVersion: typeof UNIVERSAL_OBSERVATION_SCHEMA_VERSION;
  observationId: string;
  mode: 'PAPER_ONLY';
  observedAt: number;
  venue: string;
  marketType: MarketType;
  instrumentIds: string[];
  conditionId?: string;

  versions: VersionMetadata;
  provenance: DataProvenance;
  sampling: SamplingMetadata;
  relationship: RelationshipMetadata;
  deterministic: DeterministicEvidence;
  execution: ExecutionSimulation;
  jev?: JevEvidence;

  classification: {
    opportunityClass: OpportunityClass;
    finalPaperDecision: PaperDecision;
    reasons: string[];
  };

  calibration: CalibrationMetadata;
}

export interface UniversalObservationValidation {
  valid: boolean;
  reasons: string[];
}

const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

export function validateUniversalObservation(
  observation: UniversalObservationV1
): UniversalObservationValidation {
  const reasons: string[] = [];

  if (observation.schemaVersion !== UNIVERSAL_OBSERVATION_SCHEMA_VERSION) {
    reasons.push('INVALID_SCHEMA_VERSION');
  }
  if (!observation.observationId) reasons.push('MISSING_OBSERVATION_ID');
  if (observation.mode !== 'PAPER_ONLY') reasons.push('NON_PAPER_MODE');
  if (!finiteNonNegative(observation.observedAt) || observation.observedAt === 0) {
    reasons.push('INVALID_OBSERVED_AT');
  }
  if (!observation.venue) reasons.push('MISSING_VENUE');
  if (observation.instrumentIds.length === 0) reasons.push('MISSING_INSTRUMENT_IDS');

  if (
    !finiteNonNegative(observation.provenance.receivedTimestamp) ||
    !finiteNonNegative(observation.provenance.observationTimestamp)
  ) {
    reasons.push('INVALID_PROVENANCE_TIMESTAMP');
  }

  if (observation.deterministic.status === 'REJECT' && observation.classification.finalPaperDecision === 'ACCEPT') {
    reasons.push('DETERMINISTIC_REJECT_CANNOT_ACCEPT');
  }

  if (observation.classification.finalPaperDecision === 'ACCEPT') {
    if (observation.provenance.quality !== 'VALID') reasons.push('ACCEPT_REQUIRES_VALID_DATA');
    if (observation.execution.accessibilityStatus !== 'ACCESSIBLE') {
      reasons.push('ACCEPT_REQUIRES_ACCESSIBLE_EXECUTION');
    }
  }

  if (observation.provenance.dataDepth === 'TOP_OF_BOOK') {
    if (observation.deterministic.depthSummary?.known === true &&
        observation.deterministic.depthSummary?.sufficientForTarget === true &&
        observation.deterministic.targetSize > 0) {
      reasons.push('TOP_OF_BOOK_CANNOT_PROVE_FULL_TARGET_DEPTH');
    }
  }

  if (observation.jev) {
    if (!Number.isFinite(observation.jev.acceptThreshold) ||
        observation.jev.acceptThreshold < 0 ||
        observation.jev.acceptThreshold > 1) {
      reasons.push('INVALID_JEV_THRESHOLD');
    }
    if (observation.jev.probability !== undefined &&
        (!Number.isFinite(observation.jev.probability) ||
          observation.jev.probability < 0 ||
          observation.jev.probability > 1)) {
      reasons.push('INVALID_JEV_PROBABILITY');
    }
    if (observation.jev.completedAt < observation.jev.startedAt) {
      reasons.push('INVALID_JEV_TIMING');
    }
    if (observation.jev.latencyMs < 0 || !Number.isFinite(observation.jev.latencyMs)) {
      reasons.push('INVALID_JEV_LATENCY');
    }
  }

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function universalObservationToJsonl(observation: UniversalObservationV1): string {
  return JSON.stringify(observation);
}
