import { describe, expect, it } from 'vitest';
import { simulatePaperExecution } from './paper-execution-simulator.js';
import type { PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

const monoNs = (ms:number) => String(Math.round(ms * 1_000_000));

const book = (
  wallMs:number,
  asks=[{price:0.51,size:10}],
  bids=[{price:0.49,size:10}],
  monotonicMs=wallMs,
): UnifiedMarketEvent<PolymarketBookPayload> => ({
  schemaVersion:'hale-5m-event-v0.1',
  source:'polymarket',
  kind:'book_snapshot',
  instrument:'m',
  marketId:'m',
  tokenId:'t',
  clock:{
    sourceTimestampMs:wallMs,
    receivedAtMs:wallMs,
    monotonicReceivedNs:monoNs(monotonicMs),
  },
  payload:{bids,asks},
});

const signal={
  attemptId:'a',
  marketId:'m',
  tokenId:'t',
  signalReceivedAtMs:1000,
  signalMonotonicNs:monoNs(1000),
  side:'BUY' as const,
  requestedSize:5,
  fairPrice:0.55,
};

describe('simulatePaperExecution',()=>{
  it('fills only using a book at/after configured monotonic arrival',()=>{
    const r=simulatePaperExecution(signal,book(1100),{feeRate:0,latencyMs:100,minNetEdge:0.001});
    expect(r.status).toBe('PAPER_FILLED');
    expect(r.executablePrice).toBe(0.51);
    expect(r.hypotheticalArrivalMonotonicNs).toBe(monoNs(1100));
  });

  it('misses a book that existed before hypothetical monotonic arrival',()=>{
    expect(simulatePaperExecution(signal,book(1050),{feeRate:0,latencyMs:100}).status).toBe('PAPER_MISSED');
  });

  it('ignores wall-clock reversal when monotonic receive order is valid',()=>{
    const reversedWallBook=book(100,undefined,undefined,1100);
    const r=simulatePaperExecution(
      {...signal,signalReceivedAtMs:10_000,signalMonotonicNs:monoNs(1000)},
      reversedWallBook,
      {feeRate:0,latencyMs:100,minNetEdge:0.001},
    );
    expect(r.status).toBe('PAPER_FILLED');
    expect(r.fillObservedAtMs).toBe(100);
    expect(r.fillObservedMonotonicNs).toBe(monoNs(1100));
  });

  it('rejects insufficient depth',()=>{
    expect(simulatePaperExecution(signal,book(1100,[{price:0.51,size:2}]),{feeRate:0,latencyMs:100}).status).toBe('REJECTED_NO_DEPTH');
  });

  it('rejects negative/insufficient net edge',()=>{
    expect(simulatePaperExecution(signal,book(1100),{feeRate:0,latencyMs:100,minNetEdge:0.05}).status).toBe('REJECTED_NO_EDGE');
  });
});
