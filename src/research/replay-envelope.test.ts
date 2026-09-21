import {describe,expect,it} from 'vitest';
import {CANONICAL_JSON_VERSION,EVIDENCE_HASH_ALGORITHM,REPLAY_ENVELOPE_VERSION,buildReplayManifest,hashCanonicalEvidence,replayEnvelopeToJsonl,type ReplayEnvelopeV1,validateReplayEnvelope} from './replay-envelope.js';
import {validObservation} from './universal-observation.test.js';

function envelope():ReplayEnvelopeV1{
 const raw={yesBook:{asks:[{price:.44,size:10}]},noBook:{asks:[{price:.53,size:10}]}};
 const normalized=validObservation();
 const engineInputSnapshot={yesBook:raw.yesBook,noBook:raw.noBook,targetPairShares:10};
 const rawEvidence=[{kind:'EMBEDDED_JSON' as const,source:'clob',hashAlgorithm:EVIDENCE_HASH_ALGORITHM,canonicalization:CANONICAL_JSON_VERSION,contentHash:hashCanonicalEvidence(raw),embeddedJson:raw}];
 return {envelopeVersion:REPLAY_ENVELOPE_VERSION,observationId:normalized.observationId,capturedAt:1700000000030,normalized,
  engineInputSnapshot,rawEvidence,manifest:buildReplayManifest(normalized,engineInputSnapshot,rawEvidence)
 };
}
describe('ReplayEnvelopeV1 P0',()=>{
 it('accepts content-verifiable replay evidence',()=>expect(validateReplayEnvelope(envelope())).toEqual({valid:true,reasons:[]}));
 it('canonical hash is stable across object key order',()=>expect(hashCanonicalEvidence({b:2,a:1})).toBe(hashCanonicalEvidence({a:1,b:2})));
 it('detects normalized observation mutation through manifest',()=>{const e=envelope();e.normalized.venue='tampered';expect(validateReplayEnvelope(e).reasons).toContain('NORMALIZED_OBSERVATION_HASH_MISMATCH');});
 it('detects embedded evidence mutation',()=>{const e=envelope();(e.rawEvidence[0].embeddedJson as any).yesBook.asks[0].price=.45;expect(validateReplayEnvelope(e).reasons).toContain('EMBEDDED_CONTENT_HASH_MISMATCH');});
 it('requires replay engine input',()=>{const e=envelope();(e as any).engineInputSnapshot=undefined;expect(validateReplayEnvelope(e).reasons).toContain('ENGINE_INPUT_SNAPSHOT_REQUIRED');});
 it('rejects secret-like fields in engine input',()=>{const e=envelope();e.engineInputSnapshot={apiKey:'never'};expect(validateReplayEnvelope(e).reasons).toContain('SECRET_LIKE_FIELD_IN_ENGINE_INPUT');});
 it('requires explicit hash algorithm and canonicalization for hash references',()=>{const e=envelope();e.rawEvidence=[{kind:'CONTENT_HASH',source:'clob',contentHash:'a'.repeat(64)}];expect(validateReplayEnvelope(e).reasons).toEqual(expect.arrayContaining(['HASH_ALGORITHM_REQUIRED','CANONICALIZATION_REQUIRED']));});
 it('serializes only valid replay envelopes',()=>expect(JSON.parse(replayEnvelopeToJsonl(envelope())).envelopeVersion).toBe(REPLAY_ENVELOPE_VERSION));
});
