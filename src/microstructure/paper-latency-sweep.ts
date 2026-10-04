import type { LeadLagObservation, PaperExecutionAttempt, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';
import { simulatePaperExecution } from './paper-execution-simulator.js';

export interface LatencySweepConfig {
  latenciesMs?: number[];
  requestedSize?: number;
  feeRate?: number;
  minNetEdge?: number;
}

export interface PaperCandidate {
  observation: LeadLagObservation;
  tokenId: string;
  direction: 'UP' | 'DOWN';
  fairPrice: number;
}

export function runLatencySweep(
  candidate: PaperCandidate,
  books: UnifiedMarketEvent<PolymarketBookPayload>[],
  config: LatencySweepConfig = {},
): PaperExecutionAttempt[] {
  const latencies = config.latenciesMs ?? [50, 100, 200, 500];
  const requestedSize = config.requestedSize ?? 10;
  const attempts: PaperExecutionAttempt[] = [];

  for (const latencyMs of latencies) {
    const arrival = candidate.observation.t0SpotShockMs + latencyMs;
    const book = books
      .filter(b => b.tokenId === candidate.tokenId && b.clock.receivedAtMs >= arrival)
      .sort((a,b) => a.clock.receivedAtMs - b.clock.receivedAtMs)[0];

    if (!book) {
      attempts.push({
        schemaVersion:'hale-5m-paper-attempt-v0.1',
        attemptId:`${candidate.observation.observationId}-${latencyMs}`,
        marketId:candidate.observation.marketId,
        tokenId:candidate.tokenId,
        signalReceivedAtMs:candidate.observation.t0SpotShockMs,
        hypotheticalArrivalAtMs:arrival,
        configuredLatencyMs:latencyMs,
        side:'BUY',
        requestedSize,
        referencePrice:candidate.fairPrice,
        status:'PAPER_MISSED',
        reason:'NO_BOOK_AT_OR_AFTER_HYPOTHETICAL_ARRIVAL',
      });
      continue;
    }

    attempts.push(simulatePaperExecution({
      attemptId:`${candidate.observation.observationId}-${latencyMs}`,
      marketId:candidate.observation.marketId,
      tokenId:candidate.tokenId,
      signalReceivedAtMs:candidate.observation.t0SpotShockMs,
      side:'BUY',
      requestedSize,
      fairPrice:candidate.fairPrice,
    }, book, {
      latencyMs,
      feeRate:config.feeRate ?? 0,
      minNetEdge:config.minNetEdge ?? 0,
    }));
  }
  return attempts;
}

export interface PaperSweepSummary {
  latencyMs:number; attempts:number; fills:number; misses:number; rejected:number;
  fillRate:number; meanNetEdge?:number;
}

export function summarizeLatencySweep(attempts: PaperExecutionAttempt[]): PaperSweepSummary[] {
  const latencies=[...new Set(attempts.map(a=>a.configuredLatencyMs))].sort((a,b)=>a-b);
  return latencies.map(latencyMs=>{
    const rows=attempts.filter(a=>a.configuredLatencyMs===latencyMs);
    const filled=rows.filter(a=>a.status==='PAPER_FILLED');
    const edges=filled.map(a=>a.netEdge).filter((x):x is number=>Number.isFinite(x));
    return {
      latencyMs, attempts:rows.length, fills:filled.length,
      misses:rows.filter(a=>a.status==='PAPER_MISSED').length,
      rejected:rows.filter(a=>a.status.startsWith('REJECTED_')).length,
      fillRate:rows.length ? filled.length/rows.length : 0,
      meanNetEdge:edges.length ? edges.reduce((a,b)=>a+b,0)/edges.length : undefined,
    };
  });
}
