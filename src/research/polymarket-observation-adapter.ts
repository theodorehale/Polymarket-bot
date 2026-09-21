/**
 * Polymarket Phase 4.x -> Universal Observation v2 adapter.
 *
 * This adapter is deliberately conservative:
 * - public data can establish a deterministic paper candidate
 * - it does NOT establish real execution accessibility or atomicity
 * - therefore a Jev ACCEPT is not automatically promoted to universal ACCEPT
 */
import type { PaperObservation } from '../paper/public-market-observer.js';
import type { JevPaperJudgment } from '../paper/jev-paper-judge.js';
import {
  UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
  type DataProvenance,
  type SamplingMetadata,
  type UniversalObservationV1,
  type VersionMetadata,
} from './universal-observation.js';

export interface PolymarketUniversalAdapterInput {
  observation: PaperObservation;
  jev?: JevPaperJudgment;
  observationId: string;
  provenance: DataProvenance;
  sampling: SamplingMetadata;
  relationshipVerification: UniversalObservationV1['relationship']['verification'];
  nativeSettlementCurrency: string;
  fxEvidenceReference?: string;
  versions: Omit<VersionMetadata, 'schemaVersion' | 'promptVersion'> & {
    promptVersion?: string;
  };
}

export function toUniversalPolymarketObservation(
  input: PolymarketUniversalAdapterInput
): UniversalObservationV1 {
  const { observation, jev } = input;
  const quote = observation.result.quote;
  const relationshipVerified = input.relationshipVerification.status === 'VERIFIED';
  const deterministicPass = observation.status === 'PAPER_EXECUTABLE' && relationshipVerified;

  const universalJev = jev
    ? {
        promptVersion: jev.promptVersion,
        acceptThreshold: jev.acceptThreshold,
        startedAt: jev.judgedAt,
        completedAt: jev.completedAt,
        latencyMs: jev.latencyMs,
        probability: jev.probability,
        status: jev.status,
        error: jev.error,
      }
    : undefined;

  let finalPaperDecision: UniversalObservationV1['classification']['finalPaperDecision'];
  const reasons: string[] = [];

  if (!relationshipVerified) {
    finalPaperDecision = 'REVIEW';
    reasons.push('RELATIONSHIP_NOT_VERIFIED');
  } else if (!deterministicPass) {
    finalPaperDecision = 'REJECT';
    reasons.push(...observation.rejectionReasons);
  } else if (!jev) {
    finalPaperDecision = 'REVIEW';
    reasons.push('JEV_NOT_EVALUATED');
  } else if (jev.status === 'REJECT') {
    finalPaperDecision = 'REJECT';
    reasons.push('JEV_REJECT');
  } else if (jev.status === 'JEV_UNAVAILABLE') {
    finalPaperDecision = 'JEV_UNAVAILABLE';
    reasons.push(jev.error ?? 'JEV_UNAVAILABLE');
  } else {
    // Current public-paper path has not established venue/account accessibility,
    // atomic multi-leg execution, or real fill mechanics. Keep ACCEPT/REVIEW as REVIEW.
    finalPaperDecision = 'REVIEW';
    reasons.push(
      jev.status === 'ACCEPT' ? 'ACCESSIBILITY_NOT_VERIFIED' : 'JEV_REVIEW'
    );

  }

  return {
    schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
    observationId: input.observationId,
    mode: 'PAPER_ONLY',
    observedAt: observation.observedAt,
    venue: 'polymarket',
    marketType: 'PREDICTION',
    instrumentIds: [observation.yesTokenId, observation.noTokenId],
    conditionId: observation.conditionId,
    versions: {
      schemaVersion: UNIVERSAL_OBSERVATION_SCHEMA_VERSION,
      ...input.versions,
      promptVersion: jev?.promptVersion ?? input.versions.promptVersion,
    },
    provenance: input.provenance,
    valuation: { nativeSettlementCurrency: input.nativeSettlementCurrency, reportingCurrency: 'USD', conversion: input.nativeSettlementCurrency === 'USD' ? 'NONE' : 'FX', fxEvidenceReference: input.nativeSettlementCurrency === 'USD' ? undefined : input.fxEvidenceReference },
    sampling: input.sampling,
    relationship: {
      type: 'COMPLEMENT',
      relatedInstrumentIds: [observation.yesTokenId, observation.noTokenId],
      assumptions: [
        'binary complementary outcome tokens',
        'paired payout relationship is valid for this market',
      ],
      requiredInputs: ['yes-orderbook', 'no-orderbook', 'fee-model', 'cost-model'],
      verification: input.relationshipVerification,
    },
    deterministic: {
      status: deterministicPass ? 'PASS' : 'REJECT',
      rejectionReasons: relationshipVerified ? [...observation.rejectionReasons] : ['RELATIONSHIP_NOT_VERIFIED', ...observation.rejectionReasons],
      targetSize: { amount: quote.targetPairShares, unit: 'PAIRED_SHARES' },
      expectedGrossProfit: { amount: quote.expectedGrossProfitUsd, currency: 'USD' },
      worstCaseGrossProfit: { amount: quote.worstCaseGrossProfitUsd, currency: 'USD' },
      expectedNetProfit: { amount: quote.expectedNetProfitUsd, currency: 'USD' },
      worstCaseNetProfit: { amount: quote.worstCaseNetProfitUsd, currency: 'USD' },
      expectedNetEdgeBps: quote.expectedNetEdgeBps,
      worstCaseNetEdgeBps: quote.worstCaseNetEdgeBps,
      fees: quote.expectedFeesUsd == null ? undefined : { amount: quote.expectedFeesUsd, currency: 'USD' },
      otherCosts: { amount: quote.expectedGasUsd + quote.expectedOtherCostsUsd, currency: 'USD' },
      freshness: {
        maxObservedAgeMs: Math.max(quote.books.yesAgeMs, quote.books.noAgeMs),
        skewMs: quote.books.skewMs,
      },
      depthSummary: {
        observedLevelsKnown: true,
        // Do not claim source-wide sufficiency unless provenance independently
        // establishes a documented/response-level FULL_DEPTH capability.
        sufficientForTarget:
          input.provenance.depthCapability === 'FULL_DEPTH' &&
          (input.provenance.depthCapabilityBasis === 'SOURCE_DOCUMENTED' ||
            input.provenance.depthCapabilityBasis === 'SOURCE_RESPONSE')
            ? quote.yesLeg.fullyFillable && quote.noLeg.fullyFillable
            : undefined,
      },
    },
    execution: {
      atomicity: 'UNKNOWN',
      legCount: 2,
      partialFillRisk: 'UNKNOWN',
      hedgeCompletionStatus: 'UNKNOWN',
      accessibilityStatus: 'UNKNOWN',
    },
    jev: universalJev,
    classification: {
      opportunityClass: deterministicPass ? 'STRUCTURAL' : 'NONE',
      finalPaperDecision,
      reasons,
    },
    calibration: {
      persistence: [],
    },
  };
}
