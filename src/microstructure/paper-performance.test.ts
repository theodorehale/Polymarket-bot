import {describe,expect,it} from 'vitest';
import {computeMarkouts} from './markout.js';
import {summarizePaperPerformance} from './paper-performance.js';
import type {PaperExecutionAttempt,PolymarketBookPayload,UnifiedMarketEvent} from './types.js';
const a:PaperExecutionAttempt={schemaVersion:'hale-5m-paper-attempt-v0.1',attemptId:'a',marketId:'m',tokenId:'t',signalReceivedAtMs:1000,hypotheticalArrivalAtMs:1100,configuredLatencyMs:100,side:'BUY',requestedSize:1,referencePrice:.55,status:'PAPER_FILLED',reason:'x',executablePrice:.51,executableSize:1,netEdge:.04};
const b=(ts:number,mid:number):UnifiedMarketEvent<PolymarketBookPayload>=>({schemaVersion:'hale-5m-event-v0.1',source:'polymarket',kind:'book_snapshot',instrument:'m',marketId:'m',tokenId:'t',clock:{sourceTimestampMs:ts,receivedAtMs:ts,monotonicReceivedNs:String(ts)},payload:{bids:[{price:mid-.01,size:10}],asks:[{price:mid+.01,size:10}]}});
describe('markout and performance',()=>{
 it('computes signed buy markout from first book after horizon',()=>{const m=computeMarkouts(a,[b(1200,.52)],[100]);expect(m[0]?.status).toBe('OBSERVED');expect(m[0]?.signedMarkout).toBeCloseTo(.01,12);});
 it('summarizes expectancy per attempted signal',()=>{const miss={...a,attemptId:'b',status:'PAPER_MISSED' as const,netEdge:undefined};const s=summarizePaperPerformance([a,miss],[])[0];expect(s.fillRate).toBe(.5);expect(s.expectancyPerAttempt).toBe(.02);});
});
