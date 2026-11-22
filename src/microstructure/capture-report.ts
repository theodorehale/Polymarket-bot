import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {evaluatePolymarketBookEvidence} from './evidence-gate.js';
import {closedPaperPnl,type PaperLeg} from './fees-and-pnl.js';
import type {UnifiedMarketEvent,PolymarketBookPayload,BookLevel} from './types.js';
const dir=resolve(process.argv[2]??'data/microstructure/takeover-2026-10-20');
const hashes=JSON.parse(readFileSync(resolve(dir,'data-hashes.json'),'utf8'));
const gz=readFileSync(resolve(dir,'public-book-raw.jsonl.gz'));const raw=gunzipSync(gz);
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
if(hash(gz)!==hashes.gzipSha256||hash(raw)!==hashes.rawSha256)throw Error('CAPTURE_HASH_MISMATCH');
const meta=JSON.parse(readFileSync(resolve(dir,'market-metadata.json'),'utf8'));const market=JSON.parse(meta.body);
if(meta.httpStatus!==200||market.version!=='v1'||market.feeSchedule?.exponent!==1||market.feeSchedule?.takerOnly!==true||market.feesEnabled!==true)throw Error('UNVERIFIED_MARKET_OR_FEE_MODEL');
const tokens=JSON.parse(market.clobTokenIds) as string[];const outcomes=JSON.parse(market.outcomes) as string[];
const frames=raw.toString('utf8').trim().split('\n');
const books:UnifiedMarketEvent<PolymarketBookPayload>[]=[];const rejected:Record<string,number>={};const types:Record<string,number>={};
let snapshots=0,parseErrors=0;
for(const line of frames){
 const env=JSON.parse(line);if(env.raw==='PONG')continue;
 let p;try{p=JSON.parse(env.raw);}catch{parseErrors++;continue;}
 for(const msg of Array.isArray(p)?p:[p]){
  types[msg.event_type??'UNKNOWN']=(types[msg.event_type??'UNKNOWN']??0)+1;
  if(msg.event_type!=='book')continue;snapshots++;
  if(msg.market!==market.conditionId||!tokens.includes(msg.asset_id)){rejected.IDENTITY=(rejected.IDENTITY??0)+1;continue;}
  const levels=(x:any,descending:boolean):BookLevel[]=>Array.isArray(x)?x.map((l:any)=>({price:Number(l.price),size:Number(l.size)})).sort((a:BookLevel,b:BookLevel)=>descending?b.price-a.price:a.price-b.price):[];
  const event:UnifiedMarketEvent<PolymarketBookPayload>={schemaVersion:'hale-5m-event-v0.1',source:'polymarket',kind:'book_snapshot',instrument:msg.market,marketId:msg.market,tokenId:msg.asset_id,clock:{sourceTimestampMs:Number(msg.timestamp),receivedAtMs:env.receivedAtMs,monotonicReceivedNs:env.monotonicReceivedNs},sequence:msg.hash,payload:{side:outcomes[tokens.indexOf(msg.asset_id)]?.toUpperCase() as 'UP'|'DOWN',bids:levels(msg.bids,true),asks:levels(msg.asks,false)}};
  const decision=evaluatePolymarketBookEvidence(event,env.receivedAtMs);
  if(!decision.accepted){rejected[decision.reason]=(rejected[decision.reason]??0)+1;continue;}
  books.push(event);
 }
}
function take(levels:BookLevel[],size:number){const out:BookLevel[]=[];let remain=size;for(const l of levels){const n=Math.min(remain,l.size);if(n>0)out.push({price:l.price,size:n});remain-=n;if(remain<=1e-9)break;}return remain>1e-9?undefined:out;}
function leg(b:UnifiedMarketEvent<PolymarketBookPayload>,levels:BookLevel[]):PaperLeg{return {marketId:market.conditionId,tokenId:b.tokenId!,atMs:b.clock.receivedAtMs,levels,fee:{model:'polymarket-share-price-exponent-1',marketId:market.conditionId,tokenId:b.tokenId!,rate:market.feeSchedule.rate,observedAtMs:Date.parse(meta.recordedAt),validUntilMs:Date.parse(market.endDate),sourceUrl:meta.endpoint}};}
// Diagnostic: enter on each observed snapshot, exit after a fixed holding period.
// These overlapping scenarios are NOT a strategy or portfolio and must NOT be summed.
const benchmark=[50,100,200,500].map(holdMs=>{let closed=0,missingExit=0,noDepth=0,wins=0,gross=0,fees=0,net=0;
 for(const b of books){const target=b.clock.receivedAtMs+holdMs;const exit=books.find(x=>x.tokenId===b.tokenId&&x.clock.receivedAtMs>=target&&x.clock.receivedAtMs<=target+100);if(!exit){missingExit++;continue;}const buy=take(b.payload.asks,10),sell=take(exit.payload.bids,10);if(!buy||!sell){noDepth++;continue;}const pnl=closedPaperPnl(leg(b,buy),leg(exit,sell));closed++;gross+=pnl.grossPnlUsd;fees+=pnl.feesUsd;net+=pnl.netPnlUsd;if(pnl.netPnlUsd>0)wins++;}
 return {holdingPeriodMs:holdMs,requestedShares:10,attempts:books.length,closedScenarios:closed,missingExit,noDepth,positiveAfterFees:wins,meanGrossUsd:closed?gross/closed:null,meanFeesUsd:closed?fees/closed:null,meanNetUsd:closed?net/closed:null};});
const report={schemaVersion:'hale-capture-report-v1',decision:'NO_GO',strategy:'BINANCE_BTCUSDT_TO_POLYMARKET_BTC_5M',blockers:['BINANCE_HTTP_451','NO_PAIRED_SPOT_FEED','NO_CAUSAL_STRATEGY_SIGNALS_OR_HELD_OUT_WINDOWS','SNAPSHOTS_ONLY_DELTAS_NOT_RECONSTRUCTED','TRADING_ELIGIBILITY_BLOCKED','SOURCE_CLOCK_AHEAD_OBSERVED'],data:{rawSha256:hash(raw),frames:frames.length,eventTypes:types,snapshots,acceptedSnapshots:books.length,rejected,parseErrors,marketId:market.conditionId,tokenCount:tokens.length,firstReceivedAtMs:books[0]?.clock.receivedAtMs,lastReceivedAtMs:books.at(-1)?.clock.receivedAtMs},feeEvidence:{source:meta.endpoint,recordedAt:meta.recordedAt,rate:market.feeSchedule.rate,exponent:1,rebatesAssumed:0,rounding:'up per level to 5 decimals'},mechanicalBenchmark:{label:'OVERLAPPING_SNAPSHOT_ROUND_TRIPS_NOT_STRATEGY_RETURNS',executionAssumption:'Entry at observed ask depth and exit at first full snapshot within 100ms of horizon. No queue or network execution guarantee.',rows:benchmark},strategyPaper:{attempts:0,closedTrades:0,netPnlUsd:null,reason:'NOT_EVALUABLE_WITHOUT_REQUIRED_SPOT_FEED'}};
writeFileSync(resolve(dir,'paper-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
