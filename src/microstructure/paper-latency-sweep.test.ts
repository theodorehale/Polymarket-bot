import { describe, expect, it } from 'vitest';
import { runLatencySweep, summarizeLatencySweep } from './paper-latency-sweep.js';
import type { LeadLagObservation, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';
const o:LeadLagObservation={schemaVersion:'hale-5m-leadlag-v0.1',observationId:'o',marketId:'m',spotInstrument:'BTCUSDT',t0SpotShockMs:1000};
const b=(ts:number):UnifiedMarketEvent<PolymarketBookPayload>=>({schemaVersion:'hale-5m-event-v0.1',source:'polymarket',kind:'book_snapshot',instrument:'m',marketId:'m',tokenId:'t',clock:{sourceTimestampMs:ts,receivedAtMs:ts,monotonicReceivedNs:String(ts)},payload:{bids:[{price:.49,size:100}],asks:[{price:.51,size:100}]}});
describe('paper latency sweep',()=>{
 it('runs 50/100/200/500ms against first eligible books',()=>{
   const a=runLatencySweep({observation:o,tokenId:'t',direction:'UP',fairPrice:.55},[b(1050),b(1100),b(1200),b(1500)]);
   expect(a.map(x=>x.configuredLatencyMs)).toEqual([50,100,200,500]);
   expect(a.every(x=>x.status==='PAPER_FILLED')).toBe(true);
 });
 it('summarizes fills by latency',()=>{
   const a=runLatencySweep({observation:o,tokenId:'t',direction:'UP',fairPrice:.55},[b(1050),b(1100)]);
   const s=summarizeLatencySweep(a);
   expect(s.find(x=>x.latencyMs===50)?.fillRate).toBe(1);
   expect(s.find(x=>x.latencyMs===500)?.fillRate).toBe(0);
 });
});
