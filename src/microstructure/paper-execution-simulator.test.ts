import { describe, expect, it } from 'vitest';
import { simulatePaperExecution } from './paper-execution-simulator.js';
import type { PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

const book = (ts:number, asks=[{price:0.51,size:10}], bids=[{price:0.49,size:10}]): UnifiedMarketEvent<PolymarketBookPayload> => ({
 schemaVersion:'hale-5m-event-v0.1', source:'polymarket', kind:'book_snapshot', instrument:'m', marketId:'m', tokenId:'t',
 clock:{sourceTimestampMs:ts,receivedAtMs:ts,monotonicReceivedNs:String(ts)}, payload:{bids,asks}
});
const signal={attemptId:'a',marketId:'m',tokenId:'t',signalReceivedAtMs:1000,side:'BUY' as const,requestedSize:5,fairPrice:0.55};

describe('simulatePaperExecution',()=>{
 it('fills only using a book at/after configured arrival',()=>{
   const r=simulatePaperExecution(signal,book(1100),{latencyMs:100,feeRate:0,minNetEdge:0.001});
   expect(r.status).toBe('PAPER_FILLED'); expect(r.executablePrice).toBe(0.51);
 });
 it('misses a book that existed before hypothetical arrival',()=>{
   expect(simulatePaperExecution(signal,book(1050),{latencyMs:100,feeRate:0}).status).toBe('PAPER_MISSED');
 });
 it('rejects insufficient depth',()=>{
   expect(simulatePaperExecution(signal,book(1100,[{price:0.51,size:2}]),{latencyMs:100,feeRate:0}).status).toBe('REJECTED_NO_DEPTH');
 });
 it('rejects negative/insufficient net edge',()=>{
   expect(simulatePaperExecution(signal,book(1100),{latencyMs:100,feeRate:0,minNetEdge:0.05}).status).toBe('REJECTED_NO_EDGE');
 });
});

// These regression cases deliberately fail closed rather than manufacture a fill.
describe('paper execution safety gates',()=>{
 it('rejects a future-observed book',()=>{
   expect(simulatePaperExecution(signal,book(1101),{latencyMs:100,feeRate:0}).status).toBe('PAPER_MISSED');
 });
 it('rejects mismatched market and token',()=>{
   const wrong={...book(1100),marketId:'other',tokenId:'other'};
   expect(simulatePaperExecution(signal,wrong,{latencyMs:100,feeRate:0}).status).toBe('PAPER_MISSED');
 });
 it('requires an explicit fee assumption',()=>{
   expect(()=>simulatePaperExecution(signal,book(1100),{latencyMs:100})).toThrow('EXPLICIT_NONNEGATIVE_FEE_RATE_REQUIRED');
 });
});
