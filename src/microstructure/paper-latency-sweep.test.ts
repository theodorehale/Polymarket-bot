import { describe, expect, it } from 'vitest';
import { runLatencySweep, summarizeLatencySweep } from './paper-latency-sweep.js';
import type { LeadLagObservation, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

const monoNs=(ms:number)=>String(Math.round(ms*1_000_000));
const o:LeadLagObservation={
  schemaVersion:'hale-5m-leadlag-v0.1',
  observationId:'o',
  marketId:'m',
  tokenId:'t',
  outcomeDirection:'UP',
  spotInstrument:'BTCUSDT',
  reactionStatus:'RESPONDED',
  t0SpotShockMs:1000,
  t0SpotShockMonotonicNs:monoNs(1000),
};
const b=(wallMs:number,monotonicMs=wallMs):UnifiedMarketEvent<PolymarketBookPayload>=>({
  schemaVersion:'hale-5m-event-v0.1',
  source:'polymarket',
  kind:'book_snapshot',
  instrument:'m',
  marketId:'m',
  tokenId:'t',
  clock:{sourceTimestampMs:wallMs,receivedAtMs:wallMs,monotonicReceivedNs:monoNs(monotonicMs)},
  payload:{side:'UP',bids:[{price:.49,size:90}],asks:[{price:.51,size:90}]},
});

describe('paper latency sweep',()=>{
  it('runs 50/100/200/500ms against first eligible monotonic books',()=>{
    const a=runLatencySweep(
      {observation:o,tokenId:'t',direction:'UP',fairPrice:.55},
      [b(1050),b(1100),b(1200),b(1500)],
      {feeRate:0},
    );
    expect(a.map(x=>x.configuredLatencyMs)).toEqual([50,100,200,500]);
    expect(a.every(x=>x.status==='PAPER_FILLED')).toBe(true);
  });

  it('selects by monotonic arrival even if wall-clock order reverses',()=>{
    const a=runLatencySweep(
      {observation:{...o,t0SpotShockMs:10_000},tokenId:'t',direction:'UP',fairPrice:.55},
      [b(9_000,1040),b(100,1050),b(50,1100)],
      {feeRate:0,latenciesMs:[50]},
    );
    expect(a).toHaveLength(1);
    expect(a[0].status).toBe('PAPER_FILLED');
    expect(a[0].fillObservedAtMs).toBe(100);
    expect(a[0].fillObservedMonotonicNs).toBe(monoNs(1050));
  });

  it('summarizes fills by latency',()=>{
    const a=runLatencySweep(
      {observation:o,tokenId:'t',direction:'UP',fairPrice:.55},
      [b(1050),b(1100)],
      {feeRate:0},
    );
    const s=summarizeLatencySweep(a);
    expect(s.find(x=>x.latencyMs===50)?.fillRate).toBe(1);
    expect(s.find(x=>x.latencyMs===500)?.fillRate).toBe(0);
  });
});
