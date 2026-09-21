/**
 * Replay envelope with content-verifiable evidence metadata.
 * Canonical JSON is deliberately narrow and deterministic for JSON-safe evidence.
 */
import { createHash } from 'node:crypto';
import { type UniversalObservationV1, validateUniversalObservation } from './universal-observation.js';
import { containsSecretLikeMaterial } from './security-boundary.js';

export const REPLAY_ENVELOPE_VERSION='replay-envelope-v2' as const;
export const CANONICAL_JSON_VERSION='canonical-json-v1' as const;
export const EVIDENCE_HASH_ALGORITHM='sha256' as const;

export interface RawEvidenceReference {
  kind:'EMBEDDED_JSON'|'CONTENT_HASH'|'EXTERNAL_REFERENCE'; source:string;
  hashAlgorithm?:typeof EVIDENCE_HASH_ALGORITHM; canonicalization?:typeof CANONICAL_JSON_VERSION;
  contentHash?:string; externalReference?:string; embeddedJson?:unknown;
}
export interface ReplayEnvelopeV1 {
  envelopeVersion:typeof REPLAY_ENVELOPE_VERSION; observationId:string; capturedAt:number;
  normalized:UniversalObservationV1; engineInputSnapshot:unknown; rawEvidence:RawEvidenceReference[];
  manifest:{hashAlgorithm:typeof EVIDENCE_HASH_ALGORITHM;canonicalization:typeof CANONICAL_JSON_VERSION;engineInputHash:string;normalizedObservationHash:string;rawEvidenceManifestHash:string;};
}
export interface ReplayEnvelopeValidation {valid:boolean;reasons:string[];}

function canonicalize(v:unknown,ancestors=new Set<object>()):string{
  if(v===null||typeof v==='string'||typeof v==='boolean') return JSON.stringify(v);
  if(typeof v==='number'){if(!Number.isFinite(v)) throw new Error('NON_FINITE_CANONICAL_NUMBER');return JSON.stringify(v);}
  if(Array.isArray(v)){if(ancestors.has(v)) throw new Error('CYCLIC_CANONICAL_VALUE');const next=new Set(ancestors);next.add(v);return '['+v.map(x=>canonicalize(x,next)).join(',')+']';}
  if(typeof v==='object'){
    if(ancestors.has(v as object)) throw new Error('CYCLIC_CANONICAL_VALUE');
    const next=new Set(ancestors);next.add(v as object);
    const obj=v as Record<string,unknown>;const keys=Object.keys(obj).filter(k=>obj[k]!==undefined).sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+canonicalize(obj[k],next)).join(',')+'}';
  }
  throw new Error('UNSUPPORTED_CANONICAL_VALUE');
}
export function hashCanonicalEvidence(v:unknown):string{
  return createHash(EVIDENCE_HASH_ALGORITHM).update(canonicalize(v),'utf8').digest('hex');
}
export function validateReplayEnvelope(e:ReplayEnvelopeV1):ReplayEnvelopeValidation{
  const reasons:string[]=[];
  if(e.envelopeVersion!==REPLAY_ENVELOPE_VERSION) reasons.push('INVALID_REPLAY_ENVELOPE_VERSION');
  if(!e.observationId||e.observationId!==e.normalized.observationId) reasons.push('OBSERVATION_ID_MISMATCH');
  if(!Number.isFinite(e.capturedAt)||e.capturedAt<=0) reasons.push('INVALID_CAPTURED_AT');
  if(e.engineInputSnapshot===undefined) reasons.push('ENGINE_INPUT_SNAPSHOT_REQUIRED');
  try{
    if(e.manifest.hashAlgorithm!==EVIDENCE_HASH_ALGORITHM) reasons.push('INVALID_MANIFEST_HASH_ALGORITHM');
    if(e.manifest.canonicalization!==CANONICAL_JSON_VERSION) reasons.push('INVALID_MANIFEST_CANONICALIZATION');
    if(e.engineInputSnapshot!==undefined&&e.manifest.engineInputHash!==hashCanonicalEvidence(e.engineInputSnapshot)) reasons.push('ENGINE_INPUT_HASH_MISMATCH');
    if(e.manifest.normalizedObservationHash!==hashCanonicalEvidence(e.normalized)) reasons.push('NORMALIZED_OBSERVATION_HASH_MISMATCH');
    if(e.manifest.rawEvidenceManifestHash!==hashCanonicalEvidence(e.rawEvidence)) reasons.push('RAW_EVIDENCE_MANIFEST_HASH_MISMATCH');
  }catch{reasons.push('UNHASHABLE_REPLAY_MANIFEST');}
  if(containsSecretLikeMaterial(e.engineInputSnapshot)) reasons.push('SECRET_LIKE_FIELD_IN_ENGINE_INPUT');
  const ov=validateUniversalObservation(e.normalized);reasons.push(...ov.reasons.map(x=>'OBSERVATION_'+x));
  for(const x of e.rawEvidence){
    if(!x.source) reasons.push('RAW_EVIDENCE_SOURCE_REQUIRED');
    if(x.kind==='EXTERNAL_REFERENCE'&&!x.externalReference) reasons.push('EXTERNAL_REFERENCE_REQUIRED');
    if(x.kind==='CONTENT_HASH'){
      if(x.hashAlgorithm!==EVIDENCE_HASH_ALGORITHM) reasons.push('HASH_ALGORITHM_REQUIRED');
      if(x.canonicalization!==CANONICAL_JSON_VERSION) reasons.push('CANONICALIZATION_REQUIRED');
      if(!x.contentHash||!/^[a-f0-9]{64}$/.test(x.contentHash)) reasons.push('VALID_CONTENT_HASH_REQUIRED');
    }
    if(x.kind==='EMBEDDED_JSON'){
      if(x.embeddedJson===undefined) reasons.push('EMBEDDED_JSON_REQUIRED');
      if(containsSecretLikeMaterial(x.embeddedJson)) reasons.push('SECRET_LIKE_FIELD_IN_RAW_EVIDENCE');
      if(x.hashAlgorithm!==EVIDENCE_HASH_ALGORITHM) reasons.push('HASH_ALGORITHM_REQUIRED');
      if(x.canonicalization!==CANONICAL_JSON_VERSION) reasons.push('CANONICALIZATION_REQUIRED');
      if(x.embeddedJson!==undefined){
        try{if(x.contentHash!==hashCanonicalEvidence(x.embeddedJson)) reasons.push('EMBEDDED_CONTENT_HASH_MISMATCH');}
        catch{reasons.push('UNHASHABLE_EMBEDDED_EVIDENCE');}
      }
    }
  }
  return {valid:reasons.length===0,reasons:[...new Set(reasons)]};
}
export function replayEnvelopeToJsonl(e:ReplayEnvelopeV1):string{
  const v=validateReplayEnvelope(e);if(!v.valid) throw new Error('INVALID_REPLAY_ENVELOPE:'+v.reasons.join(','));
  return JSON.stringify(e);
}

export function buildReplayManifest(normalized:UniversalObservationV1,engineInputSnapshot:unknown,rawEvidence:RawEvidenceReference[]):ReplayEnvelopeV1['manifest']{
 return {hashAlgorithm:EVIDENCE_HASH_ALGORITHM,canonicalization:CANONICAL_JSON_VERSION,engineInputHash:hashCanonicalEvidence(engineInputSnapshot),normalizedObservationHash:hashCanonicalEvidence(normalized),rawEvidenceManifestHash:hashCanonicalEvidence(rawEvidence)};
}
