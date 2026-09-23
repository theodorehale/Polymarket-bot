import { hashCanonicalEvidence } from './replay-envelope.js';
import type {
  EdgePersistencePoint,
  MarketType,
  RelationshipMetadata,
} from './universal-observation.js';

export const HYPOTHESIS_DEFINITION_VERSION = 'hypothesis-definition-v1' as const;
export const RELATIONSHIP_INSTANCE_VERSION = 'relationship-instance-v1' as const;
export const HYPOTHESIS_EVENT_VERSION = 'hypothesis-event-v1' as const;

export type HypothesisDirection = 'long' | 'short';
export type HypothesisState = 'OPEN' | 'FALSIFIED' | 'CLOSED';
export type OutcomeCheckResult =
  | 'SUPPORTED'
  | 'FALSIFIED'
  | 'INDETERMINATE'
  | 'NOT_EVALUABLE'
  | 'EXPIRED';

export interface HypothesisThresholdPolicy {
  minExpectedNetProfitUsd: number;
  minWorstCaseNetProfitUsd: number;
  minExpectedNetEdgeBps: number;
  minWorstCaseNetEdgeBps: number;
}

export interface HypothesisPolicy {
  targetPairShares: number;
  thresholds: HypothesisThresholdPolicy;
  maxBookAgeMs: number;
  maxBookSkewMs: number;
  maxFutureDriftMs: number;
  maxAdverseSlippageBps: number;
  /** Lifecycle expiry, distinct from stale/expired market evidence. */
  maxRunAgeMs?: number;
}

export interface HypothesisDefinitionInput {
  relationshipType: RelationshipMetadata['type'];
  claim: 'EXECUTABLE_NET_EDGE';
  direction: HypothesisDirection;
  policy: {
    targetPairShares: number;
    thresholds?: Partial<HypothesisThresholdPolicy>;
    maxBookAgeMs: number;
    maxBookSkewMs: number;
    maxFutureDriftMs?: number;
    maxAdverseSlippageBps?: number;
    maxRunAgeMs?: number;
  };
}

export interface HypothesisDefinition {
  schemaVersion: typeof HYPOTHESIS_DEFINITION_VERSION;
  hypothesisDefinitionId: string;
  relationshipType: RelationshipMetadata['type'];
  claim: 'EXECUTABLE_NET_EDGE';
  direction: HypothesisDirection;
  policy: HypothesisPolicy;
}

export interface RelationshipLeg {
  role: string;
  instrumentId: string;
}

export interface RelationshipInstanceInput {
  venue: string;
  marketType: MarketType;
  relationshipType: RelationshipMetadata['type'];
  conditionId?: string;
  legs: readonly RelationshipLeg[];
}

export interface RelationshipInstance {
  schemaVersion: typeof RELATIONSHIP_INSTANCE_VERSION;
  relationshipInstanceId: string;
  venue: string;
  marketType: MarketType;
  relationshipType: RelationshipMetadata['type'];
  conditionId?: string;
  /** Canonical role order; role-to-instrument mapping is never discarded. */
  legs: RelationshipLeg[];
}

export interface VerifiedRelationshipReference {
  status: 'VERIFIED';
  evidenceSource: string;
  evidenceReference: string;
  verifiedAt: number;
  reasons: string[];
}

export interface HypothesisOutcomeCheckRecord {
  outcomeId: string;
  hypothesisRunId: string;
  sourceObservationId: string;
  followupObservationId: string;
  horizonMs: number;
  checkedAt: number;
  result: OutcomeCheckResult;
  reasons: string[];
  persistence?: EdgePersistencePoint;
  replay: {
    envelopeVersion: string;
    engineInputHash: string;
    normalizedObservationHash: string;
    rawEvidenceManifestHash: string;
  };
  recomputedQuote?: {
    safeToExecute: boolean;
    expectedNetProfitUsd: number;
    worstCaseNetProfitUsd: number;
    expectedNetEdgeBps: number;
    worstCaseNetEdgeBps: number;
    rejectionReasons: string[];
  };
}

interface EventBase {
  schemaVersion: typeof HYPOTHESIS_EVENT_VERSION;
  eventId: string;
  occurredAt: number;
}

export type HypothesisEvent =
  | (EventBase & {
      type: 'RUN_OPENED';
      hypothesisRunId: string;
      hypothesisDefinitionId: string;
      relationshipInstanceId: string;
      openingObservationId: string;
      relationshipVerification: VerifiedRelationshipReference;
    })
  | (EventBase & {
      type: 'OUTCOME_CHECKED';
      hypothesisRunId: string;
      outcome: HypothesisOutcomeCheckRecord;
    })
  | (EventBase & {
      type: 'RUN_CLOSED';
      hypothesisRunId: string;
      reason: string;
    });

export interface HypothesisRunState {
  hypothesisRunId: string;
  hypothesisDefinitionId: string;
  relationshipInstanceId: string;
  openingObservationId: string;
  openedAt: number;
  state: HypothesisState;
  outcomeChecks: HypothesisOutcomeCheckRecord[];
  terminalAt?: number;
  closeReason?: string;
}

export interface HypothesisLedgerState {
  runs: Record<string, HypothesisRunState>;
  runOrder: string[];
}

export interface OpenOrReuseRunResult {
  hypothesisRunId: string;
  reused: boolean;
  event?: HypothesisEvent;
}

const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

function normalizeThresholds(
  thresholds: Partial<HypothesisThresholdPolicy> | undefined
): HypothesisThresholdPolicy {
  return {
    minExpectedNetProfitUsd: thresholds?.minExpectedNetProfitUsd ?? 0,
    minWorstCaseNetProfitUsd: thresholds?.minWorstCaseNetProfitUsd ?? 0,
    minExpectedNetEdgeBps: thresholds?.minExpectedNetEdgeBps ?? 0,
    minWorstCaseNetEdgeBps: thresholds?.minWorstCaseNetEdgeBps ?? 0,
  };
}

function validateThresholds(thresholds: HypothesisThresholdPolicy): void {
  for (const value of Object.values(thresholds)) {
    if (!Number.isFinite(value)) throw new Error('INVALID_HYPOTHESIS_THRESHOLD');
  }
}

function canonicalHypothesisDefinitionContent(input: {
  schemaVersion?: string;
  relationshipType: RelationshipMetadata['type'];
  claim: 'EXECUTABLE_NET_EDGE';
  direction: HypothesisDirection;
  policy: HypothesisPolicy | HypothesisDefinitionInput['policy'];
}) {
  if (input.schemaVersion !== undefined && input.schemaVersion !== HYPOTHESIS_DEFINITION_VERSION) {
    throw new Error('INVALID_HYPOTHESIS_DEFINITION_VERSION');
  }
  if (input.claim !== 'EXECUTABLE_NET_EDGE') throw new Error('UNSUPPORTED_HYPOTHESIS_CLAIM');
  if (input.direction !== 'long' && input.direction !== 'short') {
    throw new Error('INVALID_HYPOTHESIS_DIRECTION');
  }
  if (!finitePositive(input.policy.targetPairShares)) {
    throw new Error('INVALID_HYPOTHESIS_TARGET_SIZE');
  }
  if (!finiteNonNegative(input.policy.maxBookAgeMs)) {
    throw new Error('INVALID_HYPOTHESIS_MAX_BOOK_AGE');
  }
  if (!finiteNonNegative(input.policy.maxBookSkewMs)) {
    throw new Error('INVALID_HYPOTHESIS_MAX_BOOK_SKEW');
  }
  const maxFutureDriftMs = input.policy.maxFutureDriftMs ?? 250;
  const maxAdverseSlippageBps = input.policy.maxAdverseSlippageBps ?? 0;
  if (!finiteNonNegative(maxFutureDriftMs)) {
    throw new Error('INVALID_HYPOTHESIS_MAX_FUTURE_DRIFT');
  }
  if (!finiteNonNegative(maxAdverseSlippageBps)) {
    throw new Error('INVALID_HYPOTHESIS_MAX_ADVERSE_SLIPPAGE');
  }
  if (
    input.policy.maxRunAgeMs !== undefined &&
    !finitePositive(input.policy.maxRunAgeMs)
  ) {
    throw new Error('INVALID_HYPOTHESIS_MAX_RUN_AGE');
  }
  const thresholds = normalizeThresholds(input.policy.thresholds);
  validateThresholds(thresholds);
  return {
    schemaVersion: HYPOTHESIS_DEFINITION_VERSION,
    relationshipType: input.relationshipType,
    claim: input.claim,
    direction: input.direction,
    policy: {
      targetPairShares: input.policy.targetPairShares,
      thresholds,
      maxBookAgeMs: input.policy.maxBookAgeMs,
      maxBookSkewMs: input.policy.maxBookSkewMs,
      maxFutureDriftMs,
      maxAdverseSlippageBps,
      ...(input.policy.maxRunAgeMs === undefined
        ? {}
        : { maxRunAgeMs: input.policy.maxRunAgeMs }),
    },
  };
}

export function recomputeHypothesisDefinitionId(
  definition: Omit<HypothesisDefinition, 'hypothesisDefinitionId'> | HypothesisDefinition
): string {
  const canonical = canonicalHypothesisDefinitionContent(definition);
  return `hdef_${hashCanonicalEvidence(canonical)}`;
}

export function assertHypothesisDefinitionIdentity(
  definition: HypothesisDefinition
): void {
  if (recomputeHypothesisDefinitionId(definition) !== definition.hypothesisDefinitionId) {
    throw new Error('HYPOTHESIS_DEFINITION_ID_MISMATCH');
  }
}

export function createHypothesisDefinition(
  input: HypothesisDefinitionInput
): HypothesisDefinition {
  const canonical = canonicalHypothesisDefinitionContent(input);
  return {
    ...canonical,
    hypothesisDefinitionId: `hdef_${hashCanonicalEvidence(canonical)}`,
  };
}

function normalizeConditionId(conditionId: string | undefined): string | undefined {
  if (conditionId === undefined) return undefined;
  const normalized = conditionId.trim();
  return normalized || undefined;
}

function canonicalizeRelationshipLegs(legs: readonly RelationshipLeg[]): RelationshipLeg[] {
  if (legs.length === 0) throw new Error('RELATIONSHIP_INSTANCE_REQUIRES_LEGS');
  const normalized = legs.map((leg) => ({
    role: leg.role.trim(),
    instrumentId: leg.instrumentId.trim(),
  }));
  if (normalized.some((leg) => !leg.role || !leg.instrumentId)) {
    throw new Error('INVALID_RELATIONSHIP_LEG');
  }
  if (new Set(normalized.map((leg) => leg.role)).size !== normalized.length) {
    throw new Error('DUPLICATE_RELATIONSHIP_LEG_ROLE');
  }
  return normalized.sort((a, b) => a.role.localeCompare(b.role));
}

function canonicalRelationshipInstanceContent(input: {
  schemaVersion?: string;
  venue: string;
  marketType: MarketType;
  relationshipType: RelationshipMetadata['type'];
  conditionId?: string;
  legs: readonly RelationshipLeg[];
}) {
  if (input.schemaVersion !== undefined && input.schemaVersion !== RELATIONSHIP_INSTANCE_VERSION) {
    throw new Error('INVALID_RELATIONSHIP_INSTANCE_VERSION');
  }
  const venue = input.venue.trim();
  if (!venue) throw new Error('MISSING_RELATIONSHIP_VENUE');
  const conditionId = normalizeConditionId(input.conditionId);
  const legs = canonicalizeRelationshipLegs(input.legs);
  return {
    schemaVersion: RELATIONSHIP_INSTANCE_VERSION,
    venue,
    marketType: input.marketType,
    relationshipType: input.relationshipType,
    ...(conditionId === undefined ? {} : { conditionId }),
    legs,
  };
}

export function recomputeRelationshipInstanceId(
  relationship: Omit<RelationshipInstance, 'relationshipInstanceId'> | RelationshipInstance
): string {
  const canonical = canonicalRelationshipInstanceContent(relationship);
  return `rinst_${hashCanonicalEvidence(canonical)}`;
}

export function assertRelationshipInstanceIdentity(
  relationship: RelationshipInstance
): void {
  if (recomputeRelationshipInstanceId(relationship) !== relationship.relationshipInstanceId) {
    throw new Error('RELATIONSHIP_INSTANCE_ID_MISMATCH');
  }
}

export function createRelationshipInstance(
  input: RelationshipInstanceInput
): RelationshipInstance {
  const canonical = canonicalRelationshipInstanceContent(input);
  return {
    ...canonical,
    relationshipInstanceId: `rinst_${hashCanonicalEvidence(canonical)}`,
  };
}

export function instrumentForRole(
  relationship: RelationshipInstance,
  role: string
): string | undefined {
  return relationship.legs.find((leg) => leg.role === role)?.instrumentId;
}

export function deriveHypothesisRunId(
  hypothesisDefinitionId: string,
  relationshipInstanceId: string,
  openingObservationId: string
): string {
  if (!hypothesisDefinitionId || !relationshipInstanceId || !openingObservationId) {
    throw new Error('RUN_IDENTITY_REQUIRES_ALL_COMPONENTS');
  }
  return `hrun_${hashCanonicalEvidence({
    hypothesisDefinitionId,
    relationshipInstanceId,
    openingObservationId,
  })}`;
}

function makeEventId(payload: unknown): string {
  return `hevt_${hashCanonicalEvidence(payload)}`;
}

function requireVerifiedRelationship(
  verification: RelationshipMetadata['verification']
): VerifiedRelationshipReference {
  if (
    verification.status !== 'VERIFIED' ||
    !verification.evidenceSource?.trim() ||
    !verification.evidenceReference?.trim() ||
    !verification.verifiedAt ||
    !finitePositive(verification.verifiedAt)
  ) {
    throw new Error('HYPOTHESIS_RUN_REQUIRES_VERIFIED_RELATIONSHIP');
  }
  return {
    status: 'VERIFIED',
    evidenceSource: verification.evidenceSource,
    evidenceReference: verification.evidenceReference,
    verifiedAt: verification.verifiedAt,
    reasons: [...verification.reasons],
  };
}

export function makeRunOpenedEvent(input: {
  definition: HypothesisDefinition;
  relationship: RelationshipInstance;
  openingObservationId: string;
  openedAt: number;
  relationshipVerification: RelationshipMetadata['verification'];
}): HypothesisEvent {
  assertHypothesisDefinitionIdentity(input.definition);
  assertRelationshipInstanceIdentity(input.relationship);
  if (input.definition.relationshipType !== input.relationship.relationshipType) {
    throw new Error('DEFINITION_RELATIONSHIP_TYPE_MISMATCH');
  }
  if (!input.openingObservationId) throw new Error('MISSING_OPENING_OBSERVATION_ID');
  if (!finitePositive(input.openedAt)) throw new Error('INVALID_RUN_OPENED_AT');
  const relationshipVerification = requireVerifiedRelationship(input.relationshipVerification);
  if (relationshipVerification.verifiedAt > input.openedAt) {
    throw new Error('RELATIONSHIP_VERIFIED_AFTER_RUN_OPEN');
  }
  const hypothesisRunId = deriveHypothesisRunId(
    input.definition.hypothesisDefinitionId,
    input.relationship.relationshipInstanceId,
    input.openingObservationId
  );
  const payload = {
    schemaVersion: HYPOTHESIS_EVENT_VERSION,
    type: 'RUN_OPENED' as const,
    occurredAt: input.openedAt,
    hypothesisRunId,
    hypothesisDefinitionId: input.definition.hypothesisDefinitionId,
    relationshipInstanceId: input.relationship.relationshipInstanceId,
    openingObservationId: input.openingObservationId,
    relationshipVerification,
  };
  return { ...payload, eventId: makeEventId(payload) };
}

export function makeOutcomeCheckedEvent(
  outcome: HypothesisOutcomeCheckRecord
): HypothesisEvent {
  if (!outcome.outcomeId || !outcome.hypothesisRunId) {
    throw new Error('INVALID_OUTCOME_EVENT');
  }
  const payload = {
    schemaVersion: HYPOTHESIS_EVENT_VERSION,
    type: 'OUTCOME_CHECKED' as const,
    occurredAt: outcome.checkedAt,
    hypothesisRunId: outcome.hypothesisRunId,
    outcome,
  };
  return { ...payload, eventId: makeEventId(payload) };
}

export function makeRunLifecycleExpiryEvent(input: {
  definition: HypothesisDefinition;
  run: HypothesisRunState;
  at: number;
}): HypothesisEvent {
  assertHypothesisDefinitionIdentity(input.definition);
  if (input.run.hypothesisDefinitionId !== input.definition.hypothesisDefinitionId) {
    throw new Error('RUN_DEFINITION_ID_MISMATCH');
  }
  if (input.run.state !== 'OPEN') throw new Error('RUN_NOT_OPEN');
  const maxRunAgeMs = input.definition.policy.maxRunAgeMs;
  if (maxRunAgeMs === undefined) throw new Error('RUN_HAS_NO_LIFECYCLE_EXPIRY');
  const expiresAt = input.run.openedAt + maxRunAgeMs;
  if (!finitePositive(input.at) || input.at < expiresAt) {
    throw new Error('RUN_LIFECYCLE_EXPIRY_NOT_REACHED');
  }
  return makeRunClosedEvent({
    hypothesisRunId: input.run.hypothesisRunId,
    closedAt: input.at,
    reason: 'RUN_POLICY_EXPIRED',
  });
}

export function makeRunClosedEvent(input: {
  hypothesisRunId: string;
  closedAt: number;
  reason: string;
}): HypothesisEvent {
  if (!input.hypothesisRunId || !input.reason.trim() || !finitePositive(input.closedAt)) {
    throw new Error('INVALID_RUN_CLOSE_EVENT');
  }
  const payload = {
    schemaVersion: HYPOTHESIS_EVENT_VERSION,
    type: 'RUN_CLOSED' as const,
    occurredAt: input.closedAt,
    hypothesisRunId: input.hypothesisRunId,
    reason: input.reason,
  };
  return { ...payload, eventId: makeEventId(payload) };
}

export function emptyHypothesisLedgerState(): HypothesisLedgerState {
  return { runs: {}, runOrder: [] };
}

export function reduceHypothesisEvents(
  events: readonly HypothesisEvent[]
): HypothesisLedgerState {
  const state = emptyHypothesisLedgerState();
  const eventIds = new Set<string>();

  for (const event of events) {
    if (event.schemaVersion !== HYPOTHESIS_EVENT_VERSION) {
      throw new Error('INVALID_HYPOTHESIS_EVENT_VERSION');
    }
    if (!event.eventId || eventIds.has(event.eventId)) {
      throw new Error('DUPLICATE_OR_MISSING_HYPOTHESIS_EVENT_ID');
    }
    const { eventId, ...eventPayload } = event;
    if (makeEventId(eventPayload) !== eventId) throw new Error('HYPOTHESIS_EVENT_ID_MISMATCH');
    if (!finitePositive(event.occurredAt)) throw new Error('INVALID_HYPOTHESIS_EVENT_TIME');
    eventIds.add(event.eventId);

    if (event.type === 'RUN_OPENED') {
      const verified = requireVerifiedRelationship(event.relationshipVerification);
      if (verified.verifiedAt > event.occurredAt) throw new Error('RELATIONSHIP_VERIFIED_AFTER_RUN_OPEN');
      if (state.runs[event.hypothesisRunId]) throw new Error('RUN_ALREADY_EXISTS');
      if (Object.values(state.runs).some((existing) =>
        existing.state === 'OPEN' &&
        existing.hypothesisDefinitionId === event.hypothesisDefinitionId &&
        existing.relationshipInstanceId === event.relationshipInstanceId
      )) throw new Error('ACTIVE_RUN_ALREADY_EXISTS');
      const expectedRunId = deriveHypothesisRunId(
        event.hypothesisDefinitionId,
        event.relationshipInstanceId,
        event.openingObservationId
      );
      if (expectedRunId !== event.hypothesisRunId) throw new Error('RUN_ID_MISMATCH');
      state.runs[event.hypothesisRunId] = {
        hypothesisRunId: event.hypothesisRunId,
        hypothesisDefinitionId: event.hypothesisDefinitionId,
        relationshipInstanceId: event.relationshipInstanceId,
        openingObservationId: event.openingObservationId,
        openedAt: event.occurredAt,
        state: 'OPEN',
        outcomeChecks: [],
      };
      state.runOrder.push(event.hypothesisRunId);
      continue;
    }

    const run = state.runs[event.hypothesisRunId];
    if (!run) throw new Error('EVENT_REFERENCES_UNKNOWN_RUN');
    const previousAt = run.outcomeChecks.length
      ? run.outcomeChecks[run.outcomeChecks.length - 1].checkedAt
      : run.openedAt;
    if (event.occurredAt < previousAt) throw new Error('HYPOTHESIS_EVENT_TIME_REGRESSION');
    if (run.state !== 'OPEN') throw new Error('TERMINAL_RUN_IS_IMMUTABLE');

    if (event.type === 'OUTCOME_CHECKED') {
      const outcomeShapeReasons = validateOutcomeCheckShape(event.outcome);
      if (outcomeShapeReasons.length) {
        throw new Error('INVALID_OUTCOME_SHAPE:' + outcomeShapeReasons.join(','));
      }
      if (event.outcome.hypothesisRunId !== run.hypothesisRunId) {
        throw new Error('OUTCOME_RUN_ID_MISMATCH');
      }
      if (event.outcome.sourceObservationId !== run.openingObservationId) {
        throw new Error('OUTCOME_SOURCE_OBSERVATION_MISMATCH');
      }
      if (event.outcome.checkedAt !== event.occurredAt) {
        throw new Error('OUTCOME_EVENT_TIME_MISMATCH');
      }
      if (run.outcomeChecks.some((outcome) => outcome.outcomeId === event.outcome.outcomeId)) {
        throw new Error('DUPLICATE_OUTCOME_ID');
      }
      run.outcomeChecks.push(event.outcome);
      if (event.outcome.result === 'FALSIFIED') {
        run.state = 'FALSIFIED';
        run.terminalAt = event.occurredAt;
      } else if (event.outcome.result === 'EXPIRED') {
        run.state = 'CLOSED';
        run.terminalAt = event.occurredAt;
        run.closeReason = 'RUN_POLICY_EXPIRED';
      }
      continue;
    }

    run.state = 'CLOSED';
    run.terminalAt = event.occurredAt;
    run.closeReason = event.reason;
  }

  return state;
}

export function openOrReuseHypothesisRun(input: {
  events: readonly HypothesisEvent[];
  definition: HypothesisDefinition;
  relationship: RelationshipInstance;
  openingObservationId: string;
  openedAt: number;
  relationshipVerification: RelationshipMetadata['verification'];
}): OpenOrReuseRunResult {
  assertHypothesisDefinitionIdentity(input.definition);
  assertRelationshipInstanceIdentity(input.relationship);
  if (input.definition.relationshipType !== input.relationship.relationshipType) {
    throw new Error('DEFINITION_RELATIONSHIP_TYPE_MISMATCH');
  }
  requireVerifiedRelationship(input.relationshipVerification);
  const state = reduceHypothesisEvents(input.events);
  for (let index = state.runOrder.length - 1; index >= 0; index -= 1) {
    const run = state.runs[state.runOrder[index]];
    if (
      run.state === 'OPEN' &&
      run.hypothesisDefinitionId === input.definition.hypothesisDefinitionId &&
      run.relationshipInstanceId === input.relationship.relationshipInstanceId
    ) {
      return { hypothesisRunId: run.hypothesisRunId, reused: true };
    }
  }

  const event = makeRunOpenedEvent({
    definition: input.definition,
    relationship: input.relationship,
    openingObservationId: input.openingObservationId,
    openedAt: input.openedAt,
    relationshipVerification: input.relationshipVerification,
  });
  return { hypothesisRunId: event.hypothesisRunId, reused: false, event };
}

export function hypothesisEventToJsonl(event: HypothesisEvent): string {
  return JSON.stringify(event);
}

export function validateOutcomeCheckShape(outcome: HypothesisOutcomeCheckRecord): string[] {
  const reasons: string[] = [];
  if (!outcome.outcomeId) reasons.push('MISSING_OUTCOME_ID');
  if (!outcome.hypothesisRunId) reasons.push('MISSING_OUTCOME_RUN_ID');
  if (!outcome.sourceObservationId) reasons.push('MISSING_SOURCE_OBSERVATION_ID');
  if (!outcome.followupObservationId) reasons.push('MISSING_FOLLOWUP_OBSERVATION_ID');
  if (!finiteNonNegative(outcome.horizonMs)) reasons.push('INVALID_OUTCOME_HORIZON');
  if (!finitePositive(outcome.checkedAt)) reasons.push('INVALID_OUTCOME_CHECKED_AT');
  if (outcome.persistence) {
    if (!finiteNonNegative(outcome.persistence.horizonMs)) reasons.push('INVALID_PERSISTENCE_HORIZON');
    if (!finitePositive(outcome.persistence.checkedAt)) reasons.push('INVALID_PERSISTENCE_CHECKED_AT');
  }
  return [...new Set(reasons)];
}
