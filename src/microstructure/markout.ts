import type { PaperExecutionAttempt, PolymarketBookPayload, UnifiedMarketEvent } from './types.js';

export interface Markout {
  attemptId:string; horizonMs:number; observedAtMs?:number; midPrice?:number;
  signedMarkout?:number; status:'OBSERVED'|'MISSING';
}
function mid(b:UnifiedMarketEvent<PolymarketBookPayload>):number|undefined{
 const bid=b.payload.bids[0]?.price, ask=b.payload.asks[0]?.price;
 return Number.isFinite(bid)&&Number.isFinite(ask)?(bid+ask)/2:undefined;
}
export function computeMarkouts(
 attempt:PaperExecutionAttempt,
 books:UnifiedMarketEvent<PolymarketBookPayload>[],
 horizons=[100,250,500,1000,5000],
):Markout[]{
 if(attempt.status!=='PAPER_FILLED'||attempt.executablePrice===undefined) return [];
 const executablePrice = attempt.executablePrice;
 return horizons.map(h=>{
   const target=attempt.hypotheticalArrivalAtMs+h;
   const b=books.filter(x=>x.tokenId===attempt.tokenId&&x.clock.receivedAtMs>=target)
     .sort((a,b)=>a.clock.receivedAtMs-b.clock.receivedAtMs)[0];
   if(!b) return {attemptId:attempt.attemptId,horizonMs:h,status:'MISSING'};
   const m=mid(b); if(m===undefined) return {attemptId:attempt.attemptId,horizonMs:h,status:'MISSING'};
   const signed=attempt.side==='BUY'?m-executablePrice:executablePrice-m;
   return {attemptId:attempt.attemptId,horizonMs:h,observedAtMs:b.clock.receivedAtMs,midPrice:m,signedMarkout:signed,status:'OBSERVED'};
 });
}
