/**
 * Paper-only Jev judgment layer.
 *
 * This module never receives wallet, signer, private-key or order-submission
 * capabilities. Deterministic rejection remains authoritative: Jev may veto a
 * deterministic PASS, but it may not promote a deterministic FAIL.
 */
import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { PaperObservation } from './public-market-observer.js';

export const JEV_PROMPT_VERSION = 'jev-paper-judge-v1' as const;
export const DEFAULT_JEV_ACCEPT_THRESHOLD = 0.8 as const;

export type JevPaperStatus = 'ACCEPT' | 'REVIEW' | 'REJECT' | 'JEV_UNAVAILABLE';

export interface JevPaperJudgment {
  mode: 'PAPER_ONLY';
  promptVersion: typeof JEV_PROMPT_VERSION;
  judgedAt: number;
  completedAt: number;
  latencyMs: number;
  acceptThreshold: number;
  deterministicStatus: PaperObservation['status'];
  probability?: number;
  status: JevPaperStatus;
  error?: string;
}

export interface JevPaperJudgeOptions {
  /** Paper calibration threshold only; do not reuse for real-money execution. */
  acceptThreshold?: number;
  client?: Pick<TypeSafeClient, 'systemOne'>;
}

function sanitizedState(observation: PaperObservation) {
  const q = observation.result.quote;
  return {
    conditionId: observation.conditionId,
    observedAt: observation.observedAt,
    deterministicStatus: observation.status,
    rejectionReasons: observation.rejectionReasons,
    quote: {
      safeToExecute: q.safeToExecute,
      rejectionReasons: q.rejectionReasons,
      expectedNetProfitUsd: q.expectedNetProfitUsd,
      worstCaseNetProfitUsd: q.worstCaseNetProfitUsd,
      expectedNetEdgeBps: q.expectedNetEdgeBps,
      worstCaseNetEdgeBps: q.worstCaseNetEdgeBps,
    },
  };
}

export async function judgePaperObservationWithJev(
  observation: PaperObservation,
  options: JevPaperJudgeOptions = {}
): Promise<JevPaperJudgment> {
  const judgedAt = Date.now();
  const threshold = options.acceptThreshold ?? DEFAULT_JEV_ACCEPT_THRESHOLD;
  const finish = (
    partial: Omit<JevPaperJudgment, 'mode' | 'promptVersion' | 'judgedAt' | 'completedAt' | 'latencyMs' | 'acceptThreshold' | 'deterministicStatus'>
  ): JevPaperJudgment => {
    const completedAt = Date.now();
    return {
      mode: 'PAPER_ONLY',
      promptVersion: JEV_PROMPT_VERSION,
      judgedAt,
      completedAt,
      latencyMs: Math.max(0, completedAt - judgedAt),
      acceptThreshold: threshold,
      deterministicStatus: observation.status,
      ...partial,
    };
  };

  // Hard invariant: probabilistic judgment cannot override deterministic FAIL.
  if (observation.status !== 'PAPER_EXECUTABLE') {
    return finish({ status: 'REJECT' });
  }

  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return finish({ status: 'JEV_UNAVAILABLE', error: 'INVALID_JEV_ACCEPT_THRESHOLD' });
  }

  try {
    const client = options.client ?? new TypeSafeClient();
    const response = await client.systemOne({
      state: sanitizedState(observation),
      questions: {
        acceptable: noul(
          'Given only this paper-market observation, is the evidence sufficiently coherent and reliable to accept this deterministic executable-arbitrage candidate for PAPER observation? Treat anomalies, ambiguity, contradictory evidence, or insufficient reliability as false. This is not authorization to trade real money.'
        ),
      },
    });

    const probability = response.answers.acceptable.noul;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      return finish({ status: 'JEV_UNAVAILABLE', error: 'INVALID_JEV_PROBABILITY' });
    }

    return finish({
      probability,
      status: probability >= threshold ? 'ACCEPT' : 'REVIEW',
    });
  } catch (error) {
    return finish({
      status: 'JEV_UNAVAILABLE',
      error: error instanceof Error ? error.message : 'UNKNOWN_JEV_ERROR',
    });
  }
}
