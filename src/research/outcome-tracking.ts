import {
  calculateExecutableQuote,
  type ExecutableQuoteInput,
} from '../utils/executable-edge.js';
import {
  hashCanonicalEvidence,
  validateReplayEnvelope,
  type ReplayEnvelopeV1,
} from './replay-envelope.js';
import {
  type HypothesisDefinition,
  type HypothesisOutcomeCheckRecord,
  type HypothesisRunState,
  type OutcomeCheckResult,
  type RelationshipInstance,
  assertHypothesisDefinitionIdentity,
  assertRelationshipInstanceIdentity,
  instrumentForRole,
} from './hypothesis-lifecycle.js';

const EPS = 1e-9;

export interface EvaluateOutcomeInput {
  definition: HypothesisDefinition;
  relationship: RelationshipInstance;
  run: HypothesisRunState;
  followupReplay: ReplayEnvelopeV1;
  horizonMs: number;
  checkedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasBookShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.bids) &&
    Array.isArray(value.asks) &&
    typeof value.timestampMs === 'number' &&
    Number.isFinite(value.timestampMs)
  );
}

function asExecutableQuoteInput(
  value: unknown,
  yesTokenId: string,
  noTokenId: string
): ExecutableQuoteInput | null {
  if (!isRecord(value)) return null;
  if (value.type !== 'long' && value.type !== 'short') return null;
  if (!hasBookShape(value.yesBook) || !hasBookShape(value.noBook)) return null;
  if (typeof value.targetPairShares !== 'number' || !Number.isFinite(value.targetPairShares)) return null;
  if (!isRecord(value.yesFee) || !isRecord(value.noFee) || !isRecord(value.costs)) return null;
  if (
    typeof value.nowMs !== 'number' || !Number.isFinite(value.nowMs) ||
    typeof value.maxBookAgeMs !== 'number' || !Number.isFinite(value.maxBookAgeMs) ||
    typeof value.maxBookSkewMs !== 'number' || !Number.isFinite(value.maxBookSkewMs)
  ) return null;
  return {
    ...(value as unknown as Omit<ExecutableQuoteInput, 'yesTokenId' | 'noTokenId'>),
    yesTokenId,
    noTokenId,
  };
}

function normalizedThresholds(input: ExecutableQuoteInput) {
  return {
    minExpectedNetProfitUsd: input.thresholds?.minExpectedNetProfitUsd ?? 0,
    minWorstCaseNetProfitUsd: input.thresholds?.minWorstCaseNetProfitUsd ?? 0,
    minExpectedNetEdgeBps: input.thresholds?.minExpectedNetEdgeBps ?? 0,
    minWorstCaseNetEdgeBps: input.thresholds?.minWorstCaseNetEdgeBps ?? 0,
  };
}

function sameNumber(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS;
}

function inputMatchesDefinition(
  input: ExecutableQuoteInput,
  definition: HypothesisDefinition
): string[] {
  const reasons: string[] = [];
  if (input.type !== definition.direction) reasons.push('ENGINE_INPUT_DIRECTION_MISMATCH');
  if (!sameNumber(input.targetPairShares, definition.policy.targetPairShares)) {
    reasons.push('ENGINE_INPUT_TARGET_SIZE_MISMATCH');
  }
  const actual = normalizedThresholds(input);
  const expected = definition.policy.thresholds;
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (!sameNumber(actual[key], expected[key])) {
      reasons.push('ENGINE_INPUT_THRESHOLD_POLICY_MISMATCH');
      break;
    }
  }
  if (!sameNumber(input.maxBookAgeMs, definition.policy.maxBookAgeMs)) {
    reasons.push('ENGINE_INPUT_BOOK_AGE_POLICY_MISMATCH');
  }
  if (!sameNumber(input.maxBookSkewMs, definition.policy.maxBookSkewMs)) {
    reasons.push('ENGINE_INPUT_BOOK_SKEW_POLICY_MISMATCH');
  }
  if (!sameNumber(input.maxFutureDriftMs ?? 250, definition.policy.maxFutureDriftMs)) {
    reasons.push('ENGINE_INPUT_FUTURE_DRIFT_POLICY_MISMATCH');
  }
  if (!sameNumber(input.maxAdverseSlippageBps ?? 0, definition.policy.maxAdverseSlippageBps)) {
    reasons.push('ENGINE_INPUT_SLIPPAGE_POLICY_MISMATCH');
  }
  return reasons;
}

function inputMatchesRelationship(
  input: ExecutableQuoteInput,
  relationship: RelationshipInstance
): string[] {
  const reasons: string[] = [];
  const yes = instrumentForRole(relationship, 'YES');
  const no = instrumentForRole(relationship, 'NO');
  if (!yes || !no) return ['RELATIONSHIP_INSTANCE_REQUIRES_YES_NO_ROLES'];
  if (input.yesTokenId !== yes) reasons.push('ENGINE_INPUT_YES_ROLE_MISMATCH');
  if (input.noTokenId !== no) reasons.push('ENGINE_INPUT_NO_ROLE_MISMATCH');
  return reasons;
}

function followupMatchesRelationship(
  replay: ReplayEnvelopeV1,
  relationship: RelationshipInstance
): string[] {
  const observation = replay.normalized;
  const reasons: string[] = [];
  if (observation.venue !== relationship.venue) reasons.push('FOLLOWUP_VENUE_MISMATCH');
  if (observation.marketType !== relationship.marketType) reasons.push('FOLLOWUP_MARKET_TYPE_MISMATCH');
  if (observation.relationship.type !== relationship.relationshipType) {
    reasons.push('FOLLOWUP_RELATIONSHIP_TYPE_MISMATCH');
  }
  if (
    relationship.conditionId !== undefined &&
    observation.conditionId !== relationship.conditionId
  ) {
    reasons.push('FOLLOWUP_CONDITION_ID_MISMATCH');
  }
  for (const leg of relationship.legs) {
    if (!observation.instrumentIds.includes(leg.instrumentId)) {
      reasons.push('FOLLOWUP_RELATIONSHIP_LEG_MISSING');
      break;
    }
  }
  return reasons;
}

function invalidEvidenceReasonsFromQuote(
  quote: ReturnType<typeof calculateExecutableQuote>
): string[] {
  const reasons: string[] = [];
  if (!quote.books.fresh) reasons.push('FOLLOWUP_BOOKS_NOT_FRESH');
  if (quote.expectedFeesUsd === null || quote.worstCaseFeesUsd === null) {
    reasons.push('FOLLOWUP_FEE_EVIDENCE_UNAVAILABLE');
  }
  for (const reason of quote.rejectionReasons) {
    if (
      reason.startsWith('INVALID_') ||
      reason.includes('BOOK_STALE') ||
      reason.includes('BOOK_TIMESTAMP') ||
      reason === 'BOOK_TIMESTAMP_SKEW' ||
      reason.includes('FEE_UNAVAILABLE') ||
      reason.includes('INVALID_FEE') ||
      reason === 'WORST_CASE_GAS_BELOW_EXPECTED' ||
      reason === 'WORST_CASE_OTHER_COSTS_BELOW_EXPECTED'
    ) {
      reasons.push(reason);
    }
  }
  return [...new Set(reasons)];
}

function isDeterministicFalsificationReason(reason: string): boolean {
  return (
    reason === 'INSUFFICIENT_YES_DEPTH' ||
    reason === 'INSUFFICIENT_NO_DEPTH' ||
    reason === 'EXPECTED_NET_PROFIT_BELOW_THRESHOLD' ||
    reason === 'WORST_CASE_NET_PROFIT_BELOW_THRESHOLD' ||
    reason === 'EXPECTED_NET_EDGE_BELOW_THRESHOLD' ||
    reason === 'WORST_CASE_NET_EDGE_BELOW_THRESHOLD'
  );
}

function makeOutcomeId(input: {
  runId: string;
  followupObservationId: string;
  horizonMs: number;
  checkedAt: number;
  replayEngineInputHash: string;
}): string {
  return `hout_${hashCanonicalEvidence({
    hypothesisRunId: input.runId,
    followupObservationId: input.followupObservationId,
    horizonMs: input.horizonMs,
    checkedAt: input.checkedAt,
    replayEngineInputHash: input.replayEngineInputHash,
  })}`;
}

function buildRecord(input: EvaluateOutcomeInput, args: {
  result: OutcomeCheckResult;
  reasons: string[];
  recomputedQuote?: ReturnType<typeof calculateExecutableQuote>;
}): HypothesisOutcomeCheckRecord {
  const replay = input.followupReplay;
  const quote = args.recomputedQuote;
  const persistence =
    quote && (args.result === 'SUPPORTED' || args.result === 'FALSIFIED')
      ? {
          horizonMs: input.horizonMs,
          checkedAt: input.checkedAt,
          stillCandidate: args.result === 'SUPPORTED',
          expectedNetEdgeBps: quote.expectedNetEdgeBps,
          worstCaseNetEdgeBps: quote.worstCaseNetEdgeBps,
          ...(args.result === 'FALSIFIED'
            ? { invalidationReason: quote.rejectionReasons.join(',') || 'DETERMINISTIC_FALSIFICATION' }
            : {}),
        }
      : undefined;

  return {
    outcomeId: makeOutcomeId({
      runId: input.run.hypothesisRunId,
      followupObservationId: replay.observationId,
      horizonMs: input.horizonMs,
      checkedAt: input.checkedAt,
      replayEngineInputHash: replay.manifest.engineInputHash,
    }),
    hypothesisRunId: input.run.hypothesisRunId,
    sourceObservationId: input.run.openingObservationId,
    followupObservationId: replay.observationId,
    horizonMs: input.horizonMs,
    checkedAt: input.checkedAt,
    result: args.result,
    reasons: [...new Set(args.reasons)],
    persistence,
    replay: {
      envelopeVersion: replay.envelopeVersion,
      engineInputHash: replay.manifest.engineInputHash,
      normalizedObservationHash: replay.manifest.normalizedObservationHash,
      rawEvidenceManifestHash: replay.manifest.rawEvidenceManifestHash,
    },
    recomputedQuote: quote
      ? {
          safeToExecute: quote.safeToExecute,
          expectedNetProfitUsd: quote.expectedNetProfitUsd,
          worstCaseNetProfitUsd: quote.worstCaseNetProfitUsd,
          expectedNetEdgeBps: quote.expectedNetEdgeBps,
          worstCaseNetEdgeBps: quote.worstCaseNetEdgeBps,
          rejectionReasons: [...quote.rejectionReasons],
        }
      : undefined,
  };
}

export function evaluateHypothesisOutcome(
  input: EvaluateOutcomeInput
): HypothesisOutcomeCheckRecord {
  try {
    assertHypothesisDefinitionIdentity(input.definition);
  } catch {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['HYPOTHESIS_DEFINITION_ID_MISMATCH'],
    });
  }
  try {
    assertRelationshipInstanceIdentity(input.relationship);
  } catch {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['RELATIONSHIP_INSTANCE_ID_MISMATCH'],
    });
  }
  if (input.run.state !== 'OPEN') {
    return buildRecord(input, { result: 'NOT_EVALUABLE', reasons: ['RUN_NOT_OPEN'] });
  }
  if (
    input.run.hypothesisDefinitionId !== input.definition.hypothesisDefinitionId ||
    input.run.relationshipInstanceId !== input.relationship.relationshipInstanceId
  ) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['RUN_IDENTITY_CONTEXT_MISMATCH'],
    });
  }
  if (!Number.isFinite(input.horizonMs) || input.horizonMs < 0) {
    return buildRecord(input, { result: 'NOT_EVALUABLE', reasons: ['INVALID_OUTCOME_HORIZON'] });
  }
  if (!Number.isFinite(input.checkedAt) || input.checkedAt <= 0) {
    return buildRecord(input, { result: 'NOT_EVALUABLE', reasons: ['INVALID_OUTCOME_CHECK_TIME'] });
  }

  // Run expiry is a lifecycle-clock policy, not a market-evidence outcome.
  // Once the clock reaches expiry, callers must append a RUN_CLOSED lifecycle event.
  // A market snapshot captured before expiry can never be relabeled as EXPIRED merely
  // because evaluation happened later.
  if (
    input.definition.policy.maxRunAgeMs !== undefined &&
    input.checkedAt >= input.run.openedAt + input.definition.policy.maxRunAgeMs
  ) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['RUN_POLICY_EXPIRED_REQUIRES_LIFECYCLE_CLOSE'],
    });
  }

  // Every canonical outcome check starts from a validated replay artifact.
  // Saved UniversalObservation PASS/REJECT is never the outcome truth source.
  const replayValidation = validateReplayEnvelope(input.followupReplay);
  if (!replayValidation.valid) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: replayValidation.reasons.map((reason) => `INVALID_FOLLOWUP_REPLAY:${reason}`),
    });
  }

  const observation = input.followupReplay.normalized;
  if (observation.relationship.verification.status !== 'VERIFIED') {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['FOLLOWUP_RELATIONSHIP_NOT_VERIFIED'],
    });
  }
  if (observation.provenance.quality !== 'VALID') {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['FOLLOWUP_DATA_QUALITY_NOT_VALID', ...observation.provenance.qualityReasons],
    });
  }
  if (observation.observedAt > input.checkedAt || input.followupReplay.capturedAt > input.checkedAt) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['FOLLOWUP_EVIDENCE_FROM_FUTURE'],
    });
  }
  if (
    input.horizonMs > 0 &&
    input.followupReplay.observationId === input.run.openingObservationId
  ) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['FOLLOWUP_OBSERVATION_MUST_DIFFER'],
    });
  }

  const relationshipReasons = followupMatchesRelationship(input.followupReplay, input.relationship);
  if (relationshipReasons.length) {
    return buildRecord(input, { result: 'NOT_EVALUABLE', reasons: relationshipReasons });
  }

  const yesTokenId = instrumentForRole(input.relationship, 'YES');
  const noTokenId = instrumentForRole(input.relationship, 'NO');
  if (!yesTokenId || !noTokenId) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['RELATIONSHIP_INSTANCE_REQUIRES_YES_NO_ROLES'],
    });
  }
  const engineInput = asExecutableQuoteInput(
    input.followupReplay.engineInputSnapshot,
    yesTokenId,
    noTokenId
  );
  if (!engineInput) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['FOLLOWUP_ENGINE_INPUT_INCOMPLETE'],
    });
  }
  if (engineInput.nowMs > input.checkedAt) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['FOLLOWUP_ENGINE_TIME_FROM_FUTURE'],
    });
  }

  const definitionReasons = inputMatchesDefinition(engineInput, input.definition);
  const inputRelationshipReasons = inputMatchesRelationship(engineInput, input.relationship);
  if (definitionReasons.length || inputRelationshipReasons.length) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: [...definitionReasons, ...inputRelationshipReasons],
    });
  }

  const horizonAt = input.run.openedAt + input.horizonMs;
  if (
    input.checkedAt < horizonAt ||
    observation.observedAt < horizonAt ||
    engineInput.nowMs < horizonAt
  ) {
    return buildRecord(input, {
      result: 'INDETERMINATE',
      reasons: ['HORIZON_NOT_REACHED'],
    });
  }

  let quote: ReturnType<typeof calculateExecutableQuote>;
  try {
    quote = calculateExecutableQuote(engineInput);
  } catch {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: ['FOLLOWUP_ENGINE_RECOMPUTE_FAILED'],
    });
  }

  const evidenceInvalid = invalidEvidenceReasonsFromQuote(quote);
  if (evidenceInvalid.length) {
    return buildRecord(input, {
      result: 'NOT_EVALUABLE',
      reasons: evidenceInvalid,
      recomputedQuote: quote,
    });
  }

  if (quote.safeToExecute) {
    return buildRecord(input, {
      result: 'SUPPORTED',
      reasons: [],
      recomputedQuote: quote,
    });
  }

  const rejectionReasons = quote.rejectionReasons;
  if (
    rejectionReasons.length > 0 &&
    rejectionReasons.every(isDeterministicFalsificationReason)
  ) {
    return buildRecord(input, {
      result: 'FALSIFIED',
      reasons: rejectionReasons,
      recomputedQuote: quote,
    });
  }

  return buildRecord(input, {
    result: 'INDETERMINATE',
    reasons: rejectionReasons.length ? rejectionReasons : ['DETERMINISTIC_RESULT_AMBIGUOUS'],
    recomputedQuote: quote,
  });
}
