import type { PaperObservation } from './public-market-observer.js';

export interface PaperObservationStats {
  total: number;
  paperExecutable: number;
  rejected: number;
  executableRate: number;
  rejectionReasons: Record<string, number>;
  expectedNetProfitUsd: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  worstCaseNetProfitUsd: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
}

function summarize(values: number[]) {
  if (!values.length) return { min: null, max: null, avg: null };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, avg };
}

export function summarizePaperObservations(
  observations: readonly PaperObservation[]
): PaperObservationStats {
  const rejectionReasons: Record<string, number> = {};
  let paperExecutable = 0;
  const expected: number[] = [];
  const worst: number[] = [];

  for (const observation of observations) {
    if (observation.status === 'PAPER_EXECUTABLE') {
      paperExecutable += 1;
      expected.push(observation.result.quote.expectedNetProfitUsd);
      worst.push(observation.result.quote.worstCaseNetProfitUsd);
    } else {
      for (const reason of observation.rejectionReasons) {
        rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
      }
    }
  }

  const total = observations.length;
  const rejected = total - paperExecutable;

  return {
    total,
    paperExecutable,
    rejected,
    executableRate: total > 0 ? paperExecutable / total : 0,
    rejectionReasons,
    expectedNetProfitUsd: summarize(expected),
    worstCaseNetProfitUsd: summarize(worst),
  };
}

export function observationToJsonl(observation: PaperObservation): string {
  return JSON.stringify({
    mode: observation.mode,
    conditionId: observation.conditionId,
    yesTokenId: observation.yesTokenId,
    noTokenId: observation.noTokenId,
    observedAt: observation.observedAt,
    status: observation.status,
    rejectionReasons: observation.rejectionReasons,
    quote: {
      type: observation.result.quote.type,
      targetPairShares: observation.result.quote.targetPairShares,
      expectedNetProfitUsd: observation.result.quote.expectedNetProfitUsd,
      worstCaseNetProfitUsd: observation.result.quote.worstCaseNetProfitUsd,
      expectedNetEdgeBps: observation.result.quote.expectedNetEdgeBps,
      worstCaseNetEdgeBps: observation.result.quote.worstCaseNetEdgeBps,
      safeToExecute: observation.result.quote.safeToExecute,
    },
  });
}
