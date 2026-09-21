/**
 * Replay envelope with content-verifiable evidence metadata.
 * Canonical JSON is deliberately narrow and deterministic for JSON-safe evidence.
 */
import { createHash } from 'node:crypto';
import { type UniversalObservationV1, validateUniversalObservation } from './universal-observation.js';

export const REPLAY_ENVELOPE_VERSION='replay-envelope-v1' as const;
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
}
export interface ReplayEnvelopeValidation {valid:boolean;reasons:string[];}

const SECRET_KEY_PATTERN=/(private.?key|secret|password|mnemonic|seed.?phrase|api.?key|authorization|bearer|signer)/i;
function containsSecretLikeKey(v:unknown,seen=new Set<object>()):boolean{
  if(v===null||typeof v!=='object') return false;if(seen.has(v as object)) return false;seen.add(v as object);
  if(Array.isArray(v)) return v.some(x=>containsSecretLikeKey(x,seen));
  for(const [k,x] of Object.entries(v as Record<string,unknown>)){if(SECRET_KEY_PATTERN.test(k)) return true;if(containsSecretLikeKey(x,seen)) return true;}return false;
}
function canonicalize(v:unknown):string{
  if(v===null||typeof v==='string'||typeof v==='boolean') return JSON.stringify(v);
  if(typeof v==='number'){if(!Number.isFinite(v)) throw new Error('NON_FINITE_CANONICAL_NUMBER');return JSON.stringify(v);}
  if(Array.isArray(v)) return '['+v.map(canonicalize).join(',')+']';
  if(typeof v==='object'){
    const obj=v as Record<string,unknown>;const keys=Object.keys(obj).filter(k=>obj[k]!==undefined).sort();
    return '{'+keys.map(k=>JSON.stringify(k)+':'+canonicalize(obj[k])).join(',')+'}';
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
  if(containsSecretLikeKey(e.engineInputSnapshot)) reasons.push('SECRET_LIKE_FIELD_IN_ENGINE_INPUT');
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
      if(containsSecretLikeKey(x.embeddedJson)) reasons.push('SECRET_LIKE_FIELD_IN_RAW_EVIDENCE');
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
