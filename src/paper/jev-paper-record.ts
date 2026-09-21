import type { PaperObservation } from './public-market-observer.js';
import type { JevPaperJudgment } from './jev-paper-judge.js';

export interface JevPaperRecord {
  schemaVersion: 'jev-paper-record-v1';
  mode: 'PAPER_ONLY';
  conditionId: string;
  observedAt: number;
  deterministic: {
    status: PaperObservation['status'];
    rejectionReasons: string[];
    expectedNetProfitUsd: number;
    worstCaseNetProfitUsd: number;
    expectedNetEdgeBps: number;
    worstCaseNetEdgeBps: number;
  };
  jev: JevPaperJudgment;
}

export function makeJevPaperRecord(
  observation: PaperObservation,
  judgment: JevPaperJudgment
): JevPaperRecord {
  return {
    schemaVersion: 'jev-paper-record-v1',
    mode: 'PAPER_ONLY',
    conditionId: observation.conditionId,
    observedAt: observation.observedAt,
    deterministic: {
      status: observation.status,
      rejectionReasons: [...observation.rejectionReasons],
      expectedNetProfitUsd: observation.result.quote.expectedNetProfitUsd,
      worstCaseNetProfitUsd: observation.result.quote.worstCaseNetProfitUsd,
      expectedNetEdgeBps: observation.result.quote.expectedNetEdgeBps,
      worstCaseNetEdgeBps: observation.result.quote.worstCaseNetEdgeBps,
    },
    jev: judgment,
  };
}

export function jevPaperRecordToJsonl(record: JevPaperRecord): string {
  return JSON.stringify(record);
}
