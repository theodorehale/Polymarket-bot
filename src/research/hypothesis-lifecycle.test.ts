import { describe, expect, it } from 'vitest';
import {
  createHypothesisDefinition,
  createRelationshipInstance,
  makeOutcomeCheckedEvent,
  makeRunLifecycleExpiryEvent,
  makeRunOpenedEvent,
  openOrReuseHypothesisRun,
  reduceHypothesisEvents,
  type HypothesisOutcomeCheckRecord,
} from './hypothesis-lifecycle.js';

function definition() {
  return createHypothesisDefinition({
    relationshipType: 'COMPLEMENT',
    claim: 'EXECUTABLE_NET_EDGE',
    direction: 'long',
    policy: {
      targetPairShares: 10,
      thresholds: {
        minExpectedNetProfitUsd: 0.1,
        minWorstCaseNetProfitUsd: 0.05,
        minExpectedNetEdgeBps: 10,
        minWorstCaseNetEdgeBps: 5,
      },
      maxBookAgeMs: 1_000,
      maxBookSkewMs: 100,
      maxAdverseSlippageBps: 0,
    },
  });
}

const VERIFIED_RELATIONSHIP = {
  status: 'VERIFIED' as const,
  evidenceSource: 'fixture-contract',
  evidenceReference: 'fixture://condition-1',
  verifiedAt: 900,
  reasons: [],
};

function relationship() {
  return createRelationshipInstance({
    venue: 'polymarket',
    marketType: 'PREDICTION',
    relationshipType: 'COMPLEMENT',
    conditionId: 'condition-1',
    legs: [
      { role: 'YES', instrumentId: 'yes-1' },
      { role: 'NO', instrumentId: 'no-1' },
    ],
  });
}

function falsifiedOutcome(runId: string, sourceObservationId: string): HypothesisOutcomeCheckRecord {
  return {
    outcomeId: 'outcome-1',
    hypothesisRunId: runId,
    sourceObservationId,
    followupObservationId: 'obs-followup',
    horizonMs: 1_000,
    checkedAt: 2_000,
    result: 'FALSIFIED',
    reasons: ['WORST_CASE_NET_PROFIT_BELOW_THRESHOLD'],
    replay: {
      envelopeVersion: 'replay-envelope-v2',
      engineInputHash: 'a'.repeat(64),
      normalizedObservationHash: 'b'.repeat(64),
      rawEvidenceManifestHash: 'c'.repeat(64),
    },
  };
}

describe('hypothesis identity and lifecycle', () => {
  it('keeps DefinitionId stable while relationship identity is role-aware', () => {
    const firstDefinition = definition();
    const secondDefinition = definition();
    expect(secondDefinition.hypothesisDefinitionId).toBe(firstDefinition.hypothesisDefinitionId);
    const stricterFreshness = createHypothesisDefinition({
      relationshipType: 'COMPLEMENT',
      claim: 'EXECUTABLE_NET_EDGE',
      direction: 'long',
      policy: {
        ...firstDefinition.policy,
        maxBookAgeMs: firstDefinition.policy.maxBookAgeMs - 1,
      },
    });
    expect(stricterFreshness.hypothesisDefinitionId).not.toBe(firstDefinition.hypothesisDefinitionId);

    const a = createRelationshipInstance({
      venue: 'polymarket',
      marketType: 'PREDICTION',
      relationshipType: 'COMPLEMENT',
      conditionId: 'condition-1',
      legs: [
        { role: 'YES', instrumentId: 'yes-1' },
        { role: 'NO', instrumentId: 'no-1' },
      ],
    });
    const sameSemanticsDifferentInputOrder = createRelationshipInstance({
      venue: 'polymarket',
      marketType: 'PREDICTION',
      relationshipType: 'COMPLEMENT',
      conditionId: 'condition-1',
      legs: [
        { role: 'NO', instrumentId: 'no-1' },
        { role: 'YES', instrumentId: 'yes-1' },
      ],
    });
    const swappedRoles = createRelationshipInstance({
      venue: 'polymarket',
      marketType: 'PREDICTION',
      relationshipType: 'COMPLEMENT',
      conditionId: 'condition-1',
      legs: [
        { role: 'YES', instrumentId: 'no-1' },
        { role: 'NO', instrumentId: 'yes-1' },
      ],
    });

    expect(sameSemanticsDifferentInputOrder.relationshipInstanceId).toBe(a.relationshipInstanceId);
    expect(swappedRoles.relationshipInstanceId).not.toBe(a.relationshipInstanceId);
  });

  it('normalizes optional conditionId by trimming without lowercasing identifiers', () => {
    const trimmed = createRelationshipInstance({
      venue: 'polymarket',
      marketType: 'PREDICTION',
      relationshipType: 'COMPLEMENT',
      conditionId: '  condition-1  ',
      legs: [
        { role: 'YES', instrumentId: 'yes-1' },
        { role: 'NO', instrumentId: 'no-1' },
      ],
    });
    const canonical = relationship();
    const differentCase = createRelationshipInstance({
      venue: 'polymarket',
      marketType: 'PREDICTION',
      relationshipType: 'COMPLEMENT',
      conditionId: 'Condition-1',
      legs: [
        { role: 'YES', instrumentId: 'yes-1' },
        { role: 'NO', instrumentId: 'no-1' },
      ],
    });

    expect(trimmed.conditionId).toBe('condition-1');
    expect(trimmed.relationshipInstanceId).toBe(canonical.relationshipInstanceId);
    expect(differentCase.conditionId).toBe('Condition-1');
    expect(differentCase.relationshipInstanceId).not.toBe(canonical.relationshipInstanceId);
  });

  it('rejects a tampered Definition whose stored ID no longer matches its policy content', () => {
    const d = definition();
    const tampered = {
      ...d,
      policy: {
        ...d.policy,
        thresholds: {
          ...d.policy.thresholds,
          minWorstCaseNetProfitUsd: d.policy.thresholds.minWorstCaseNetProfitUsd + 1,
        },
      },
    };
    expect(() => openOrReuseHypothesisRun({
      events: [],
      definition: tampered,
      relationship: relationship(),
      openingObservationId: 'obs-tampered-definition',
      openedAt: 1_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    })).toThrow('HYPOTHESIS_DEFINITION_ID_MISMATCH');
  });

  it('rejects a tampered RelationshipInstance whose stored ID no longer matches YES/NO roles', () => {
    const r = relationship();
    const tampered = {
      ...r,
      legs: [
        { role: 'YES', instrumentId: 'no-1' },
        { role: 'NO', instrumentId: 'yes-1' },
      ],
    };
    expect(() => openOrReuseHypothesisRun({
      events: [],
      definition: definition(),
      relationship: tampered,
      openingObservationId: 'obs-tampered-relationship',
      openedAt: 1_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    })).toThrow('RELATIONSHIP_INSTANCE_ID_MISMATCH');
  });

  it('closes lifecycle expiry from the run clock, not from market evidence', () => {
    const base = definition();
    const d = createHypothesisDefinition({
      relationshipType: base.relationshipType,
      claim: base.claim,
      direction: base.direction,
      policy: { ...base.policy, maxRunAgeMs: 1_000 },
    });
    const opened = openOrReuseHypothesisRun({
      events: [],
      definition: d,
      relationship: relationship(),
      openingObservationId: 'obs-expiry',
      openedAt: 1_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    const events = [opened.event!];
    const run = reduceHypothesisEvents(events).runs[opened.hypothesisRunId];

    expect(() => makeRunLifecycleExpiryEvent({
      definition: d,
      run,
      at: 1_999,
    })).toThrow('RUN_LIFECYCLE_EXPIRY_NOT_REACHED');

    const expiry = makeRunLifecycleExpiryEvent({
      definition: d,
      run,
      at: 2_000,
    });
    expect(expiry.type).toBe('RUN_CLOSED');
    if (expiry.type === 'RUN_CLOSED') expect(expiry.reason).toBe('RUN_POLICY_EXPIRED');

    const final = reduceHypothesisEvents([...events, expiry]);
    expect(final.runs[opened.hypothesisRunId].state).toBe('CLOSED');
    expect(final.runs[opened.hypothesisRunId].closeReason).toBe('RUN_POLICY_EXPIRED');
  });

  it('requires verified relationship evidence before opening or reusing a run', () => {
    const d = definition();
    const r = relationship();
    expect(() => openOrReuseHypothesisRun({
      events: [],
      definition: d,
      relationship: r,
      openingObservationId: 'obs-1',
      openedAt: 1_000,
      relationshipVerification: { status: 'UNVERIFIED', reasons: ['not verified'] },
    })).toThrow('HYPOTHESIS_RUN_REQUIRES_VERIFIED_RELATIONSHIP');
  });

  it('reducer rejects two simultaneous OPEN runs for the same definition and relationship', () => {
    const d = definition();
    const r = relationship();
    const first = makeRunOpenedEvent({
      definition: d,
      relationship: r,
      openingObservationId: 'obs-1',
      openedAt: 1_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    const second = makeRunOpenedEvent({
      definition: d,
      relationship: r,
      openingObservationId: 'obs-2',
      openedAt: 1_100,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    expect(() => reduceHypothesisEvents([first, second])).toThrow('ACTIVE_RUN_ALREADY_EXISTS');
  });

  it('reuses the same active run across repeated polling', () => {
    const d = definition();
    const r = relationship();
    const opened = openOrReuseHypothesisRun({
      events: [],
      definition: d,
      relationship: r,
      openingObservationId: 'obs-1',
      openedAt: 1_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    expect(opened.reused).toBe(false);
    expect(opened.event).toBeDefined();

    const repeated = openOrReuseHypothesisRun({
      events: [opened.event!],
      definition: d,
      relationship: r,
      openingObservationId: 'obs-2',
      openedAt: 1_100,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    expect(repeated.reused).toBe(true);
    expect(repeated.hypothesisRunId).toBe(opened.hypothesisRunId);
    expect(repeated.event).toBeUndefined();
  });

  it('creates a new RunId after a terminal run without mutating the old run', () => {
    const d = definition();
    const r = relationship();
    const first = openOrReuseHypothesisRun({
      events: [], definition: d, relationship: r, openingObservationId: 'obs-1', openedAt: 1_000, relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    const firstOutcome = makeOutcomeCheckedEvent(
      falsifiedOutcome(first.hypothesisRunId, 'obs-1')
    );
    const events = [first.event!, firstOutcome];
    const before = reduceHypothesisEvents(events);
    expect(before.runs[first.hypothesisRunId].state).toBe('FALSIFIED');

    const second = openOrReuseHypothesisRun({
      events,
      definition: d,
      relationship: r,
      openingObservationId: 'obs-2',
      openedAt: 3_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    expect(second.reused).toBe(false);
    expect(second.hypothesisRunId).not.toBe(first.hypothesisRunId);

    const after = reduceHypothesisEvents([...events, second.event!]);
    expect(after.runs[first.hypothesisRunId]).toEqual(before.runs[first.hypothesisRunId]);
    expect(after.runs[second.hypothesisRunId].state).toBe('OPEN');
  });

  it('treats SUPPORTED as non-terminal and rejects events appended to terminal runs', () => {
    const d = definition();
    const r = relationship();
    const opened = openOrReuseHypothesisRun({
      events: [], definition: d, relationship: r, openingObservationId: 'obs-1', openedAt: 1_000, relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    const supported: HypothesisOutcomeCheckRecord = {
      ...falsifiedOutcome(opened.hypothesisRunId, 'obs-1'),
      outcomeId: 'outcome-supported',
      result: 'SUPPORTED',
      reasons: [],
    };
    const supportedEvent = makeOutcomeCheckedEvent(supported);
    expect(reduceHypothesisEvents([opened.event!, supportedEvent]).runs[opened.hypothesisRunId].state).toBe('OPEN');

    const falsifiedEvent = makeOutcomeCheckedEvent(
      falsifiedOutcome(opened.hypothesisRunId, 'obs-1')
    );
    const terminal = [opened.event!, falsifiedEvent];
    expect(() => reduceHypothesisEvents([...terminal, supportedEvent])).toThrow('TERMINAL_RUN_IS_IMMUTABLE');
  });
});
