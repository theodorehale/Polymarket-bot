/**
 * P0-hardened market-agnostic research schema.
 * Paper-only: no network, wallet, signer, broker, or order code.
 */
export const UNIVERSAL_OBSERVATION_SCHEMA_VERSION = 'universal-observation-v2' as const;

export type MarketType = 'PREDICTION' | 'FUTURES' | 'OPTIONS' | 'ETF' | 'OTHER';
export type SamplingGroup = 'CONTROL_RANDOM'|'CONTROL_LIQUID'|'DETERMINISTIC_CANDIDATE'|'JEV_REVIEW'|'JEV_ACCEPT';
export type DataQualityStatus = 'VALID'|'STALE'|'SKEWED'|'PARTIAL'|'MALFORMED'|'UNSUPPORTED'|'SOURCE_UNAVAILABLE';
export type OpportunityClass = 'STRUCTURAL'|'RELATIVE_VALUE'|'SEMANTIC'|'NONE';
export type AccessibilityStatus = 'ACCESSIBLE'|'RESTRICTED'|'INSTITUTIONAL_ONLY'|'UNKNOWN';
export type DeterministicStatus = 'PASS'|'REJECT';
export type PaperDecision = 'ACCEPT'|'REVIEW'|'REJECT'|'JEV_UNAVAILABLE';
export type RelationshipVerificationStatus = 'VERIFIED'|'UNVERIFIED'|'INVALID'|'SOURCE_UNAVAILABLE';
export type DepthCapability = 'TOP_OF_BOOK'|'FULL_DEPTH'|'PARTIAL_DEPTH'|'UNKNOWN';

export interface MoneyValue { amount: number; currency: string; }
export interface ValuationMetadata { nativeSettlementCurrency: string; reportingCurrency: string; conversion: 'NONE'|'FX'; fxEvidenceReference?: string; }
export interface QuantityValue { amount: number; unit: string; }

export interface VersionMetadata {
  schemaVersion: typeof UNIVERSAL_OBSERVATION_SCHEMA_VERSION;
  samplingVersion: string; relationshipVersion: string; deterministicEngineVersion: string;
  executionModelVersion: string; feeModelVersion: string; costModelVersion: string; promptVersion?: string;
}

export interface DataProvenance {
  dataSource: string; feedType: string;
  snapshotOrIncremental: 'SNAPSHOT'|'INCREMENTAL'|'UNKNOWN';
  sourceTimestamp?: number;
  receivedTimestamp: number;
  observationTimestamp: number;
  sourceClock: 'SOURCE'|'LOCAL'|'UNKNOWN';
  sourceClockUncertaintyMs?: number;
  depthCapability: DepthCapability;
  depthCapabilityBasis: 'SOURCE_DOCUMENTED'|'SOURCE_RESPONSE'|'OBSERVED_ONLY'|'UNKNOWN';
  sourceVersion?: string;
  quality: DataQualityStatus; qualityReasons: string[];
}

export interface SamplingMetadata {
  group: SamplingGroup; discoveryReason: string;
  eligibilityChecks: Array<{name:string;passed:boolean;reason?:string}>;
  randomizationSeed?: string;
}

export interface RelationshipMetadata {
  type: 'COMPLEMENT'|'PARITY'|'REPLICATION'|'HEDGE'|'CARRY'|'CONVERSION'|'CONDITIONAL_PROBABILITY'|'SEMANTIC_DEPENDENCY'|'STATISTICAL';
  relatedInstrumentIds: string[]; assumptions: string[]; requiredInputs: string[];
  verification: {
    status: RelationshipVerificationStatus;
    evidenceSource?: string;
    evidenceReference?: string;
    verifiedAt?: number;
    reasons: string[];
  };
}

export interface DeterministicEvidence {
  status: DeterministicStatus; rejectionReasons: string[];
  targetSize: QuantityValue;
  expectedGrossProfit?: MoneyValue; worstCaseGrossProfit?: MoneyValue;
  expectedNetProfit?: MoneyValue; worstCaseNetProfit?: MoneyValue;
  expectedNetEdgeBps?: number; worstCaseNetEdgeBps?: number;
  fees?: MoneyValue; slippage?: MoneyValue; financingCosts?: MoneyValue; otherCosts?: MoneyValue;
  freshness?: {maxObservedAgeMs?:number;skewMs?:number};
  depthSummary?: {observedLevelsKnown:boolean;sufficientForTarget?:boolean};
}

export interface ExecutionSimulation {
  atomicity:'ATOMIC'|'NON_ATOMIC'|'UNKNOWN'; legCount:number; estimatedLatencyMs?:number;
  partialFillRisk:'NONE'|'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN';
  hedgeCompletionStatus:'NOT_REQUIRED'|'COMPLETE'|'INCOMPLETE'|'UNKNOWN';
  capitalRequired?:MoneyValue; marginRequired?:MoneyValue; accessibilityStatus:AccessibilityStatus;
}

export interface JevEvidence {
  promptVersion:string; acceptThreshold:number; startedAt:number; completedAt:number; latencyMs:number;
  probability?:number; status:PaperDecision; error?:string;
  vendorMetadata?:Record<string,string|number|boolean|null>;
}
export interface EdgePersistencePoint {
  horizonMs:number; checkedAt:number; stillCandidate:boolean; expectedNetEdgeBps?:number;
  worstCaseNetEdgeBps?:number; invalidationReason?:string;
}
export interface CalibrationMetadata { persistence:EdgePersistencePoint[]; laterOutcome?:string; calibrationLabel?:string; }

export interface UniversalObservationV1 {
  schemaVersion:typeof UNIVERSAL_OBSERVATION_SCHEMA_VERSION; observationId:string; mode:'PAPER_ONLY';
  observedAt:number; venue:string; marketType:MarketType; instrumentIds:string[]; conditionId?:string;
  versions:VersionMetadata; provenance:DataProvenance; valuation:ValuationMetadata; sampling:SamplingMetadata; relationship:RelationshipMetadata;
  deterministic:DeterministicEvidence; execution:ExecutionSimulation; jev?:JevEvidence;
  classification:{opportunityClass:OpportunityClass;finalPaperDecision:PaperDecision;reasons:string[]};
  calibration:CalibrationMetadata;
}
export interface UniversalObservationValidation { valid:boolean; reasons:string[]; }

const finiteNonNegative=(v:number)=>Number.isFinite(v)&&v>=0;
const validMoney=(v:MoneyValue|undefined)=>!v||(Number.isFinite(v.amount)&&v.currency.trim().length>0);
const validQuantity=(v:QuantityValue)=>Number.isFinite(v.amount)&&v.amount>=0&&v.unit.trim().length>0;

export function validateUniversalObservation(o:UniversalObservationV1):UniversalObservationValidation{
  const reasons:string[]=[];
  if(o.schemaVersion!==UNIVERSAL_OBSERVATION_SCHEMA_VERSION) reasons.push('INVALID_SCHEMA_VERSION');
  if(!o.observationId) reasons.push('MISSING_OBSERVATION_ID');
  if(o.mode!=='PAPER_ONLY') reasons.push('NON_PAPER_MODE');
  if(!finiteNonNegative(o.observedAt)||o.observedAt===0) reasons.push('INVALID_OBSERVED_AT');
  if(!o.venue) reasons.push('MISSING_VENUE');
  if(o.instrumentIds.length===0) reasons.push('MISSING_INSTRUMENT_IDS');
  if(!validQuantity(o.deterministic.targetSize)) reasons.push('INVALID_TARGET_QUANTITY');
  if(!o.valuation.nativeSettlementCurrency.trim()||!o.valuation.reportingCurrency.trim()) reasons.push('INVALID_VALUATION_CURRENCY');
  if(o.valuation.conversion==='NONE'&&o.valuation.nativeSettlementCurrency!==o.valuation.reportingCurrency) reasons.push('CURRENCY_MISMATCH_REQUIRES_FX');
  if(o.valuation.conversion==='FX'&&!o.valuation.fxEvidenceReference) reasons.push('FX_REQUIRES_EVIDENCE');

  for(const v of [o.deterministic.expectedGrossProfit,o.deterministic.worstCaseGrossProfit,o.deterministic.expectedNetProfit,o.deterministic.worstCaseNetProfit,o.deterministic.fees,o.deterministic.slippage,o.deterministic.financingCosts,o.deterministic.otherCosts,o.execution.capitalRequired,o.execution.marginRequired]){
    if(!validMoney(v)) reasons.push('INVALID_MONEY_VALUE');
  }

  const p=o.provenance;
  if(!finiteNonNegative(p.receivedTimestamp)||!finiteNonNegative(p.observationTimestamp)) reasons.push('INVALID_PROVENANCE_TIMESTAMP');
  if(p.observationTimestamp<p.receivedTimestamp) reasons.push('OBSERVATION_PRECEDES_RECEIPT');
  if(p.sourceTimestamp!==undefined&&!finiteNonNegative(p.sourceTimestamp)) reasons.push('INVALID_SOURCE_TIMESTAMP');
  if(p.sourceClockUncertaintyMs!==undefined&&!finiteNonNegative(p.sourceClockUncertaintyMs)) reasons.push('INVALID_SOURCE_CLOCK_UNCERTAINTY');
  // Only compare source and local time when explicitly declared to share the LOCAL clock domain.
  if(p.sourceTimestamp!==undefined&&p.sourceClock==='LOCAL'&&p.sourceTimestamp>p.receivedTimestamp) reasons.push('SOURCE_TIMESTAMP_AFTER_RECEIPT');

  if(o.deterministic.status==='PASS'&&o.relationship.verification.status!=='VERIFIED') reasons.push('DETERMINISTIC_PASS_REQUIRES_VERIFIED_RELATIONSHIP');
  if(o.deterministic.status==='REJECT'&&o.classification.finalPaperDecision==='ACCEPT') reasons.push('DETERMINISTIC_REJECT_CANNOT_ACCEPT');
  if(o.classification.finalPaperDecision==='ACCEPT'){
    if(p.quality!=='VALID') reasons.push('ACCEPT_REQUIRES_VALID_DATA');
    if(o.execution.accessibilityStatus!=='ACCESSIBLE') reasons.push('ACCEPT_REQUIRES_ACCESSIBLE_EXECUTION');
    if(o.relationship.verification.status!=='VERIFIED') reasons.push('ACCEPT_REQUIRES_VERIFIED_RELATIONSHIP');
  }

  const depth=o.deterministic.depthSummary;
  if(depth?.sufficientForTarget===true&&o.deterministic.targetSize.amount>0){
    if(p.depthCapability!=='FULL_DEPTH') reasons.push('INSUFFICIENT_SOURCE_DEPTH_CAPABILITY');
    if(p.depthCapabilityBasis==='OBSERVED_ONLY'||p.depthCapabilityBasis==='UNKNOWN') reasons.push('UNVERIFIED_SOURCE_DEPTH_CAPABILITY');
  }

  if(o.relationship.verification.status==='VERIFIED'&&!o.relationship.verification.evidenceSource) reasons.push('VERIFIED_RELATIONSHIP_REQUIRES_EVIDENCE_SOURCE');

  if(o.jev){
    if(!Number.isFinite(o.jev.acceptThreshold)||o.jev.acceptThreshold<0||o.jev.acceptThreshold>1) reasons.push('INVALID_JEV_THRESHOLD');
    if(o.jev.probability!==undefined&&(!Number.isFinite(o.jev.probability)||o.jev.probability<0||o.jev.probability>1)) reasons.push('INVALID_JEV_PROBABILITY');
    if(o.jev.completedAt<o.jev.startedAt) reasons.push('INVALID_JEV_TIMING');
    if(o.jev.latencyMs<0||!Number.isFinite(o.jev.latencyMs)||o.jev.latencyMs!==o.jev.completedAt-o.jev.startedAt) reasons.push('INVALID_JEV_LATENCY');
  }
  return {valid:reasons.length===0,reasons:[...new Set(reasons)]};
}

export function universalObservationToJsonl(o:UniversalObservationV1):string{
  const validation=validateUniversalObservation(o);
  if(!validation.valid) throw new Error('INVALID_UNIVERSAL_OBSERVATION:'+validation.reasons.join(','));
  return JSON.stringify(o);
}
