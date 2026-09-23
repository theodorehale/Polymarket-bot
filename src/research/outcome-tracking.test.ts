import { describe, expect, it } from 'vitest';
import type { ExecutableQuoteInput } from '../utils/executable-edge.js';
import {
  buildReplayManifest,
  REPLAY_ENVELOPE_VERSION,
  type ReplayEnvelopeV1,
} from './replay-envelope.js';
import {
  UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
  type RelationshipVerificationStatus,
  type UniversalObservationV1,
} from './universal-observation.js';
import {
  createHypothesisDefinition,
  createRelationshipInstance,
  makeOutcomeCheckedEvent,
  openOrReuseHypothesisRun,
  reduceHypothesisEvents,
  type HypothesisEvent,
} from './hypothesis-lifecycle.js';
import { evaluateHypothesisOutcome } from './outcome-tracking.js';

const THRESHOLDS = {
  minExpectedNetProfitUsd: 0.1,
  minWorstCaseNetProfitUsd: 0.05,
  minExpectedNetEdgeBps: 10,
  minWorstCaseNetEdgeBps: 5,
};

function definition(maxRunAgeMs = 20_000) {
  return createHypothesisDefinition({
    relationshipType: 'COMPLEMENT',
    claim: 'EXECUTABLE_NET_EDGE',
    direction: 'long',
    policy: {
      targetPairShares: 10,
      thresholds: THRESHOLDS,
      maxBookAgeMs: 1_000,
      maxBookSkewMs: 100,
      maxAdverseSlippageBps: 0,
      maxRunAgeMs,
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

function engineInput(nowMs: number, yesAsk: number, noAsk: number): ExecutableQuoteInput {
  return {
    type: 'long',
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesBook: {
      bids: [{ price: 0.43, size: 100 }],
      asks: [{ price: yesAsk, size: 100 }],
      timestampMs: nowMs - 20,
    },
    noBook: {
      bids: [{ price: 0.52, size: 100 }],
      asks: [{ price: noAsk, size: 100 }],
      timestampMs: nowMs - 25,
    },
    targetPairShares: 10,
    yesFee: { status: 'known', kind: 'zero' },
    noFee: { status: 'known', kind: 'zero' },
    costs: {
      expectedGasUsd: 0,
      worstCaseGasUsd: 0,
      expectedOtherCostsUsd: 0,
      worstCaseOtherCostsUsd: 0,
    },
    nowMs,
    maxBookAgeMs: 1_000,
    maxBookSkewMs: 100,
    maxAdverseSlippageBps: 0,
    thresholds: THRESHOLDS,
  };
}

function normalizedObservation(input: {
  observationId: string;
  observedAt: number;
  relationshipStatus?: RelationshipVerificationStatus;
  savedDeterministicStatus?: 'PASS' | 'REJECT';
  quality?: UniversalObservationV1['provenance']['quality'];
}): UniversalObservationV1 {
  const relationshipStatus = input.relationshipStatus ?? 'VERIFIED';
  const deterministicStatus = input.savedDeterministicStatus ?? 'PASS';
  const verified = relationshipStatus === 'VERIFIED';
  return {
    schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
    observationId: input.observationId,
    mode: 'PAPER_ONLY',
    observedAt: input.observedAt,
    venue: 'polymarket',
    marketType: 'PREDICTION',
    instrumentIds: ['yes-1', 'no-1'],
    conditionId: 'condition-1',
    versions: {
      schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
      samplingVersion: 'sampling-v1',
      relationshipVersion: 'relationship-v1',
      deterministicEngineVersion: 'executable-edge-v1',
      executionModelVersion: 'paper-v1',
      feeModelVersion: 'fee-v1',
      costModelVersion: 'cost-v1',
    },
    provenance: {
      dataSource: 'fixture',
      feedType: 'snapshot',
      snapshotOrIncremental: 'SNAPSHOT',
      sourceTimestamp: input.observedAt - 30,
      receivedTimestamp: input.observedAt - 10,
      observationTimestamp: input.observedAt,
      sourceClock: 'LOCAL',
      depthCapability: 'FULL_DEPTH',
      depthCapabilityBasis: 'SOURCE_RESPONSE',
      quality: input.quality ?? 'VALID',
      qualityReasons: input.quality && input.quality !== 'VALID' ? ['fixture-quality'] : [],
    },
    valuation: {
      nativeSettlementCurrency: 'USD',
      reportingCurrency: 'USD',
      conversion: 'NONE',
    },
    sampling: {
      group: 'DETERMINISTIC_CANDIDATE',
      discoveryReason: 'fixture',
      eligibilityChecks: [],
    },
    relationship: {
      type: 'COMPLEMENT',
      relatedInstrumentIds: ['yes-1', 'no-1'],
      assumptions: ['binary complement'],
      requiredInputs: ['yes-book', 'no-book'],
      verification: verified
        ? {
            status: 'VERIFIED',
            evidenceSource: 'fixture-contract',
            evidenceReference: 'fixture://condition-1',
            verifiedAt: input.observedAt - 20,
            reasons: [],
          }
        : { status: relationshipStatus, reasons: ['not verified'] },
    },
    deterministic: {
      status: deterministicStatus,
      rejectionReasons: deterministicStatus === 'REJECT' ? ['SAVED_REJECT_ONLY'] : [],
      targetSize: { amount: 10, unit: 'PAIRED_SHARES' },
      expectedNetProfit: {
        amount: deterministicStatus === 'PASS' ? 99 : -99,
        currency: 'USD',
      },
      worstCaseNetProfit: {
        amount: deterministicStatus === 'PASS' ? 99 : -99,
        currency: 'USD',
      },
      expectedNetEdgeBps: deterministicStatus === 'PASS' ? 9_999 : -9_999,
      worstCaseNetEdgeBps: deterministicStatus === 'PASS' ? 9_999 : -9_999,
      depthSummary: { observedLevelsKnown: true, sufficientForTarget: true },
    },
    execution: {
      atomicity: 'UNKNOWN',
      legCount: 2,
      partialFillRisk: 'UNKNOWN',
      hedgeCompletionStatus: 'UNKNOWN',
      accessibilityStatus: 'UNKNOWN',
    },
    classification: {
      opportunityClass: deterministicStatus === 'PASS' ? 'STRUCTURAL' : 'NONE',
      finalPaperDecision: 'REVIEW',
      reasons: [],
    },
    calibration: { persistence: [] },
  };
}

function replay(input: {
  observationId: string;
  observedAt: number;
  yesAsk: number;
  noAsk: number;
  relationshipStatus?: RelationshipVerificationStatus;
  savedDeterministicStatus?: 'PASS' | 'REJECT';
  quality?: UniversalObservationV1['provenance']['quality'];
  mutateEngineInput?: (engine: ExecutableQuoteInput) => void;
}): ReplayEnvelopeV1 {
  const normalized = normalizedObservation(input);
  const engine = engineInput(input.observedAt, input.yesAsk, input.noAsk);
  input.mutateEngineInput?.(engine);
  const {
    yesTokenId: _yesTokenId,
    noTokenId: _noTokenId,
    ...replayEngineInput
  } = engine;
  const rawEvidence: ReplayEnvelopeV1['rawEvidence'] = [];
  return {
    envelopeVersion: REPLAY_ENVELOPE_VERSION,
    observationId: normalized.observationId,
    capturedAt: input.observedAt,
    normalized,
    engineInputSnapshot: replayEngineInput,
    rawEvidence,
    manifest: buildReplayManifest(normalized, replayEngineInput, rawEvidence),
  };
}

function openRun(openingObservationId = 'obs-0', openedAt = 10_000) {
  const d = definition();
  const r = relationship();
  const opened = openOrReuseHypothesisRun({
    events: [],
    definition: d,
    relationship: r,
    openingObservationId,
    openedAt,
    relationshipVerification: VERIFIED_RELATIONSHIP,
  });
  const state = reduceHypothesisEvents([opened.event!]);
  return { d, r, opened, run: state.runs[opened.hypothesisRunId] };
}

describe('outcome tracking from verified replay input', () => {
  it('recomputes with Executable Edge instead of trusting saved deterministic PASS/REJECT', () => {
    const { d, r, run } = openRun();

    const savedRejectButExecutable = replay({
      observationId: 'obs-supported',
      observedAt: 11_000,
      yesAsk: 0.44,
      noAsk: 0.53,
      savedDeterministicStatus: 'REJECT',
    });
    const supported = evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: savedRejectButExecutable,
      horizonMs: 1_000,
      checkedAt: 11_000,
    });
    expect(supported.result).toBe('SUPPORTED');
    expect(supported.recomputedQuote?.safeToExecute).toBe(true);

    const savedPassButNotExecutable = replay({
      observationId: 'obs-falsified',
      observedAt: 12_000,
      yesAsk: 0.5,
      noAsk: 0.51,
      savedDeterministicStatus: 'PASS',
    });
    const falsified = evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: savedPassButNotExecutable,
      horizonMs: 2_000,
      checkedAt: 12_000,
    });
    expect(falsified.result).toBe('FALSIFIED');
    expect(falsified.recomputedQuote?.safeToExecute).toBe(false);
  });

  it('returns NOT_EVALUABLE for unverified relationship or invalid/stale evidence', () => {
    const { d, r, run } = openRun();
    const unverified = replay({
      observationId: 'obs-unverified',
      observedAt: 11_000,
      yesAsk: 0.44,
      noAsk: 0.53,
      relationshipStatus: 'UNVERIFIED',
      savedDeterministicStatus: 'REJECT',
    });
    expect(evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: unverified,
      horizonMs: 1_000,
      checkedAt: 11_000,
    }).result).toBe('NOT_EVALUABLE');

    const stale = replay({
      observationId: 'obs-stale',
      observedAt: 12_000,
      yesAsk: 0.44,
      noAsk: 0.53,
      mutateEngineInput: (engine) => {
        engine.yesBook.timestampMs = engine.nowMs - 5_000;
      },
    });
    const staleResult = evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: stale,
      horizonMs: 2_000,
      checkedAt: 12_000,
    });
    expect(staleResult.result).toBe('NOT_EVALUABLE');
    expect(staleResult.reasons).toContain('FOLLOWUP_BOOKS_NOT_FRESH');
  });

  it('uses INDETERMINATE before the horizon and EXPIRED only for run-policy expiry', () => {
    const d = definition(2_000);
    const r = relationship();
    const opened = openOrReuseHypothesisRun({
      events: [],
      definition: d,
      relationship: r,
      openingObservationId: 'obs-0',
      openedAt: 10_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    const run = reduceHypothesisEvents([opened.event!]).runs[opened.hypothesisRunId];
    const evidence = replay({
      observationId: 'obs-1',
      observedAt: 11_000,
      yesAsk: 0.44,
      noAsk: 0.53,
    });
    expect(evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: evidence,
      horizonMs: 1_500,
      checkedAt: 11_000,
    }).result).toBe('INDETERMINATE');

    expect(evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: evidence,
      horizonMs: 1_000,
      checkedAt: 13_000,
    }).result).toBe('EXPIRED');
  });
});

describe('V2.0 Minimum Scientific Loop integration fixtures', () => {
  it('Fixture A: OPEN → NOT_EVALUABLE → SUPPORTED → FALSIFIED replays identically', () => {
    const d = definition();
    const r = relationship();
    const opened = openOrReuseHypothesisRun({
      events: [],
      definition: d,
      relationship: r,
      openingObservationId: 'obs-0',
      openedAt: 10_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    const events: HypothesisEvent[] = [opened.event!];

    let run = reduceHypothesisEvents(events).runs[opened.hypothesisRunId];
    expect(run.state).toBe('OPEN');

    const notEvaluable = evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: replay({
        observationId: 'obs-1',
        observedAt: 11_000,
        yesAsk: 0.44,
        noAsk: 0.53,
        relationshipStatus: 'UNVERIFIED',
        savedDeterministicStatus: 'REJECT',
      }),
      horizonMs: 1_000,
      checkedAt: 11_000,
    });
    expect(notEvaluable.result).toBe('NOT_EVALUABLE');
    events.push(makeOutcomeCheckedEvent(notEvaluable));
    run = reduceHypothesisEvents(events).runs[opened.hypothesisRunId];
    expect(run.state).toBe('OPEN');

    const supported = evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: replay({
        observationId: 'obs-2',
        observedAt: 12_000,
        yesAsk: 0.44,
        noAsk: 0.53,
        savedDeterministicStatus: 'REJECT',
      }),
      horizonMs: 2_000,
      checkedAt: 12_000,
    });
    expect(supported.result).toBe('SUPPORTED');
    events.push(makeOutcomeCheckedEvent(supported));
    run = reduceHypothesisEvents(events).runs[opened.hypothesisRunId];
    expect(run.state).toBe('OPEN');

    const falsified = evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run,
      followupReplay: replay({
        observationId: 'obs-3',
        observedAt: 13_000,
        yesAsk: 0.5,
        noAsk: 0.51,
        savedDeterministicStatus: 'PASS',
      }),
      horizonMs: 3_000,
      checkedAt: 13_000,
    });
    expect(falsified.result).toBe('FALSIFIED');
    events.push(makeOutcomeCheckedEvent(falsified));

    const finalState = reduceHypothesisEvents(events);
    expect(finalState.runs[opened.hypothesisRunId].state).toBe('FALSIFIED');
    expect(finalState.runs[opened.hypothesisRunId].outcomeChecks.map((x) => x.result)).toEqual([
      'NOT_EVALUABLE',
      'SUPPORTED',
      'FALSIFIED',
    ]);

    const replayedEvents = events.map(
      (event) => JSON.parse(JSON.stringify(event)) as HypothesisEvent
    );
    expect(reduceHypothesisEvents(replayedEvents)).toEqual(finalState);
  });

  it('Fixture B: terminal old run stays immutable and recurrence creates a new RunId', () => {
    const d = definition();
    const r = relationship();
    const first = openOrReuseHypothesisRun({
      events: [],
      definition: d,
      relationship: r,
      openingObservationId: 'obs-first',
      openedAt: 10_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    const events: HypothesisEvent[] = [first.event!];
    let firstRun = reduceHypothesisEvents(events).runs[first.hypothesisRunId];

    const terminalOutcome = evaluateHypothesisOutcome({
      definition: d,
      relationship: r,
      run: firstRun,
      followupReplay: replay({
        observationId: 'obs-terminal',
        observedAt: 11_000,
        yesAsk: 0.5,
        noAsk: 0.51,
      }),
      horizonMs: 1_000,
      checkedAt: 11_000,
    });
    expect(terminalOutcome.result).toBe('FALSIFIED');
    events.push(makeOutcomeCheckedEvent(terminalOutcome));
    const terminalState = reduceHypothesisEvents(events);
    firstRun = terminalState.runs[first.hypothesisRunId];
    expect(firstRun.state).toBe('FALSIFIED');

    const recurrence = openOrReuseHypothesisRun({
      events,
      definition: d,
      relationship: r,
      openingObservationId: 'obs-recurrence',
      openedAt: 20_000,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    expect(recurrence.reused).toBe(false);
    expect(recurrence.hypothesisRunId).not.toBe(first.hypothesisRunId);
    events.push(recurrence.event!);

    const afterRecurrence = reduceHypothesisEvents(events);
    expect(afterRecurrence.runs[first.hypothesisRunId]).toEqual(firstRun);
    expect(afterRecurrence.runs[recurrence.hypothesisRunId].state).toBe('OPEN');
    expect(
      afterRecurrence.runs[recurrence.hypothesisRunId].hypothesisDefinitionId
    ).toBe(d.hypothesisDefinitionId);
    expect(
      afterRecurrence.runs[recurrence.hypothesisRunId].relationshipInstanceId
    ).toBe(r.relationshipInstanceId);

    const repeatedPoll = openOrReuseHypothesisRun({
      events,
      definition: d,
      relationship: r,
      openingObservationId: 'obs-recurrence-poll-2',
      openedAt: 20_100,
      relationshipVerification: VERIFIED_RELATIONSHIP,
    });
    expect(repeatedPoll.reused).toBe(true);
    expect(repeatedPoll.hypothesisRunId).toBe(recurrence.hypothesisRunId);
    expect(repeatedPoll.event).toBeUndefined();
  });
});
