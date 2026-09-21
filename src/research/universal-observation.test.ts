import { describe,expect,it } from 'vitest';
import { UNIVERSAL_OBSERVATION_SCHEMA_VERSION,type UniversalObservationV1,validateUniversalObservation,universalObservationToJsonl } from './universal-observation.js';

export function validObservation():UniversalObservationV1{return {
 schemaVersion:UNIVERSAL_OBSERVATION_SCHEMA_VERSION,observationId:'obs-1',mode:'PAPER_ONLY',observedAt:1700000000020,venue:'polymarket',marketType:'PREDICTION',instrumentIds:['yes','no'],
 versions:{schemaVersion:UNIVERSAL_OBSERVATION_SCHEMA_VERSION,samplingVersion:'s1',relationshipVersion:'r1',deterministicEngineVersion:'d1',executionModelVersion:'e1',feeModelVersion:'f1',costModelVersion:'c1'},
 valuation:{nativeSettlementCurrency:'USD',reportingCurrency:'USD',conversion:'NONE'},
 provenance:{dataSource:'clob',feedType:'rest',snapshotOrIncremental:'SNAPSHOT',sourceTimestamp:1700000000000,receivedTimestamp:1700000000010,observationTimestamp:1700000000020,sourceClock:'LOCAL',depthCapability:'FULL_DEPTH',depthCapabilityBasis:'SOURCE_RESPONSE',quality:'VALID',qualityReasons:[]},
 sampling:{group:'DETERMINISTIC_CANDIDATE',discoveryReason:'fixture',eligibilityChecks:[]},
 relationship:{type:'COMPLEMENT',relatedInstrumentIds:['yes','no'],assumptions:[],requiredInputs:['books'],verification:{status:'VERIFIED',evidenceSource:'fixture-contract',evidenceReference:'fixture://contract/yes-no',verifiedAt:1700000000005,reasons:[]}},
 deterministic:{status:'PASS',rejectionReasons:[],targetSize:{amount:10,unit:'PAIRED_SHARES'},expectedNetProfit:{amount:.2,currency:'USD'},worstCaseNetProfit:{amount:.1,currency:'USD'},depthSummary:{observedLevelsKnown:true,sufficientForTarget:true}},
 execution:{atomicity:'NON_ATOMIC',legCount:2,partialFillRisk:'UNKNOWN',hedgeCompletionStatus:'UNKNOWN',accessibilityStatus:'ACCESSIBLE'},
 classification:{opportunityClass:'STRUCTURAL',finalPaperDecision:'ACCEPT',reasons:[]},calibration:{persistence:[]}
};}
describe('UniversalObservationV1 P0',()=>{
 it('accepts explicit units, currency, verified relation and sourced depth',()=>expect(validateUniversalObservation(validObservation())).toEqual({valid:true,reasons:[]}));
 it('rejects impossible local timestamp ordering',()=>{const o=validObservation();o.provenance.observationTimestamp=o.provenance.receivedTimestamp-1;o.provenance.sourceTimestamp=o.provenance.receivedTimestamp+1;expect(validateUniversalObservation(o).reasons).toEqual(expect.arrayContaining(['OBSERVATION_PRECEDES_RECEIPT','SOURCE_TIMESTAMP_AFTER_RECEIPT']));});
 it('does not compare clocks when source clock domain is unknown',()=>{const o=validObservation();o.provenance.sourceClock='UNKNOWN';o.provenance.sourceTimestamp=o.provenance.receivedTimestamp+1000;expect(validateUniversalObservation(o).reasons).not.toContain('SOURCE_TIMESTAMP_AFTER_RECEIPT');});
 it('rejects target depth claims from unverified source capability',()=>{const o=validObservation();o.provenance.depthCapabilityBasis='OBSERVED_ONLY';expect(validateUniversalObservation(o).reasons).toContain('UNVERIFIED_SOURCE_DEPTH_CAPABILITY');});
 it('requires verified relationship before deterministic PASS',()=>{const o=validObservation();o.relationship.verification={status:'UNVERIFIED',reasons:['not checked']};expect(validateUniversalObservation(o).reasons).toEqual(expect.arrayContaining(['DETERMINISTIC_PASS_REQUIRES_VERIFIED_RELATIONSHIP','ACCEPT_REQUIRES_VERIFIED_RELATIONSHIP']));});
 it('requires FX evidence when native and reporting currencies differ',()=>{const o=validObservation();o.valuation={nativeSettlementCurrency:'USDC',reportingCurrency:'USD',conversion:'FX'};expect(validateUniversalObservation(o).reasons).toContain('FX_REQUIRES_EVIDENCE');});
 it('rejects unitless quantity and currencyless money',()=>{const o=validObservation();o.deterministic.targetSize.unit='';o.deterministic.expectedNetProfit={amount:1,currency:''};expect(validateUniversalObservation(o).reasons).toEqual(expect.arrayContaining(['INVALID_TARGET_QUANTITY','INVALID_MONEY_VALUE']));});
 it('forbids deterministic reject from becoming ACCEPT',()=>{const o=validObservation();o.deterministic.status='REJECT';expect(validateUniversalObservation(o).reasons).toContain('DETERMINISTIC_REJECT_CANNOT_ACCEPT');});
 it('fails serialization closed on invalid evidence',()=>{const o=validObservation();o.relationship.verification.status='UNVERIFIED';expect(()=>universalObservationToJsonl(o)).toThrow(/INVALID_UNIVERSAL_OBSERVATION/);});
});
