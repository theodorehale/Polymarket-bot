/**
 * Immutable research evidence envelope for replay.
 *
 * The envelope stores normalized evidence plus optional raw evidence metadata.
 * Raw evidence may be embedded for small fixtures or referenced by content hash/location
 * for larger captures. Secrets must never be stored here.
 */
import {
  type UniversalObservationV1,
  validateUniversalObservation,
} from './universal-observation.js';

export const REPLAY_ENVELOPE_VERSION = 'replay-envelope-v1' as const;

export interface RawEvidenceReference {
  kind: 'EMBEDDED_JSON' | 'CONTENT_HASH' | 'EXTERNAL_REFERENCE';
  source: string;
  contentHash?: string;
  externalReference?: string;
  embeddedJson?: unknown;
}

export interface ReplayEnvelopeV1 {
  envelopeVersion: typeof REPLAY_ENVELOPE_VERSION;
  observationId: string;
  capturedAt: number;
  normalized: UniversalObservationV1;
  rawEvidence: RawEvidenceReference[];
}

export interface ReplayEnvelopeValidation {
  valid: boolean;
  reasons: string[];
}

const SECRET_KEY_PATTERN = /(private.?key|secret|password|mnemonic|seed.?phrase|api.?key|authorization|bearer|signer)/i;

function containsSecretLikeKey(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretLikeKey(item, seen));
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) return true;
    if (containsSecretLikeKey(child, seen)) return true;
  }
  return false;
}

export function validateReplayEnvelope(
  envelope: ReplayEnvelopeV1
): ReplayEnvelopeValidation {
  const reasons: string[] = [];
  if (envelope.envelopeVersion !== REPLAY_ENVELOPE_VERSION) {
    reasons.push('INVALID_REPLAY_ENVELOPE_VERSION');
  }
  if (!envelope.observationId || envelope.observationId !== envelope.normalized.observationId) {
    reasons.push('OBSERVATION_ID_MISMATCH');
  }
  if (!Number.isFinite(envelope.capturedAt) || envelope.capturedAt <= 0) {
    reasons.push('INVALID_CAPTURED_AT');
  }

  const observationValidation = validateUniversalObservation(envelope.normalized);
  reasons.push(...observationValidation.reasons.map((reason) => 'OBSERVATION_' + reason));

  for (const evidence of envelope.rawEvidence) {
    if (!evidence.source) reasons.push('RAW_EVIDENCE_SOURCE_REQUIRED');

    if (evidence.kind === 'CONTENT_HASH' && !evidence.contentHash) {
      reasons.push('CONTENT_HASH_REQUIRED');
    }
    if (evidence.kind === 'EXTERNAL_REFERENCE' && !evidence.externalReference) {
      reasons.push('EXTERNAL_REFERENCE_REQUIRED');
    }
    if (evidence.kind === 'EMBEDDED_JSON') {
      if (evidence.embeddedJson === undefined) reasons.push('EMBEDDED_JSON_REQUIRED');
      if (containsSecretLikeKey(evidence.embeddedJson)) reasons.push('SECRET_LIKE_FIELD_IN_RAW_EVIDENCE');
    }
  }

  return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function replayEnvelopeToJsonl(envelope: ReplayEnvelopeV1): string {
  const validation = validateReplayEnvelope(envelope);
  if (!validation.valid) {
    throw new Error('INVALID_REPLAY_ENVELOPE:' + validation.reasons.join(','));
  }
  return JSON.stringify(envelope);
}
