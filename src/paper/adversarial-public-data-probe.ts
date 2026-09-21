/**
 * Phase 4.1 adversarial public-data probe.
 *
 * Evidence collection only. It deliberately does NOT calculate arbitrage,
 * invoke Jev, construct a UniversalObservation, or expose execution methods.
 */
import type { Market, MarketService, Orderbook } from '../services/market-service.js';
import { sanitizeExternalError, validateExternalInputShape } from '../research/security-boundary.js';

export type ProbeIssue =
 | 'MARKET_UNAVAILABLE'|'MARKET_INACTIVE'|'MARKET_CLOSED'|'ORDERS_NOT_ACCEPTED'
 | 'NOT_EXACTLY_TWO_TOKENS'|'DUPLICATE_TOKEN_ID'|'EMPTY_OUTCOME'
 | 'BOOK_FETCH_FAILED'|'BOOK_TOKEN_MISMATCH'|'BOOK_TIMESTAMP_MISSING'
 | 'BOOK_TIMESTAMP_FUTURE'|'BOOK_TOO_OLD'|'BOOK_SKEW'
 | 'MALFORMED_LEVEL'|'EXTERNAL_INPUT_REJECTED';

export interface PublicDataProbeRecord {
 mode:'PAPER_ONLY'; purpose:'ADVERSARIAL_DATA_QUALITY';
 conditionId:string; receivedAt:number; market?:{
  active:boolean;closed:boolean;acceptingOrders:boolean;endDateIso?:string|null;
  tokens:Array<{tokenId:string;outcome:string}>;
 };
 books?:Array<{requestedTokenId:string;returnedTokenId?:string;timestamp:number;bids:number;asks:number}>;
 issues:ProbeIssue[]; errors:string[];
}

type ProbeMarketService=Pick<MarketService,'getClobMarket'|'getTokenOrderbook'>;

function inspectBook(book:Orderbook,tokenId:string,now:number,maxAgeMs:number,issues:ProbeIssue[]){
 if(!book.tokenId || book.tokenId!==tokenId) issues.push('BOOK_TOKEN_MISMATCH');
 if(!Number.isFinite(book.timestamp)||book.timestamp<=0) issues.push('BOOK_TIMESTAMP_MISSING');
 else {
  if(book.timestamp>now) issues.push('BOOK_TIMESTAMP_FUTURE');
  if(now-book.timestamp>maxAgeMs) issues.push('BOOK_TOO_OLD');
 }
 for(const level of [...book.bids,...book.asks]){
  if(!Number.isFinite(level.price)||!Number.isFinite(level.size)||level.price<0||level.price>1||level.size<0) {
   issues.push('MALFORMED_LEVEL'); break;
  }
 }
}

export async function probePublicMarket(
 service:ProbeMarketService,conditionId:string,
 options:{now?:()=>number;maxBookAgeMs?:number;maxBookSkewMs?:number}={}
):Promise<PublicDataProbeRecord>{
 const now=options.now??Date.now,maxAgeMs=options.maxBookAgeMs??10_000,maxSkewMs=options.maxBookSkewMs??2_000;
 const receivedAt=now(),issues:ProbeIssue[]=[],errors:string[]=[];
 let market:Market|null=null;
 try{market=await service.getClobMarket(conditionId);}catch(e){errors.push(sanitizeExternalError(e));}
 if(!market){issues.push('MARKET_UNAVAILABLE');return {mode:'PAPER_ONLY',purpose:'ADVERSARIAL_DATA_QUALITY',conditionId,receivedAt,issues:[...new Set(issues)],errors};}
 const shapeReasons=validateExternalInputShape(market);
 if(shapeReasons.length){issues.push('EXTERNAL_INPUT_REJECTED');errors.push(...shapeReasons);}
 if(!market.active) issues.push('MARKET_INACTIVE');
 if(market.closed) issues.push('MARKET_CLOSED');
 if(!market.acceptingOrders) issues.push('ORDERS_NOT_ACCEPTED');
 if(market.tokens.length!==2) issues.push('NOT_EXACTLY_TWO_TOKENS');
 if(new Set(market.tokens.map(t=>t.tokenId)).size!==market.tokens.length) issues.push('DUPLICATE_TOKEN_ID');
 if(market.tokens.some(t=>!t.outcome.trim())) issues.push('EMPTY_OUTCOME');

 const marketEvidence={active:market.active,closed:market.closed,acceptingOrders:market.acceptingOrders,endDateIso:market.endDateIso,tokens:market.tokens.map(t=>({tokenId:t.tokenId,outcome:t.outcome}))};
 if(issues.includes('EXTERNAL_INPUT_REJECTED')||market.tokens.length!==2)
  return {mode:'PAPER_ONLY',purpose:'ADVERSARIAL_DATA_QUALITY',conditionId,receivedAt,market:marketEvidence,issues:[...new Set(issues)],errors};

 const books:Array<{requestedTokenId:string;book:Orderbook}>=[];
 for(const token of market.tokens){
  try{const b=await service.getTokenOrderbook(token.tokenId);inspectBook(b,token.tokenId,now(),maxAgeMs,issues);books.push({requestedTokenId:token.tokenId,book:b});}
  catch(e){issues.push('BOOK_FETCH_FAILED');errors.push(sanitizeExternalError(e));}
 }
 if(books.length===2&&Number.isFinite(books[0].book.timestamp)&&Number.isFinite(books[1].book.timestamp)&&Math.abs(books[0].book.timestamp-books[1].book.timestamp)>maxSkewMs) issues.push('BOOK_SKEW');
 return {mode:'PAPER_ONLY',purpose:'ADVERSARIAL_DATA_QUALITY',conditionId,receivedAt,market:marketEvidence,
  books:books.map(({requestedTokenId,book:b})=>({requestedTokenId,returnedTokenId:b.tokenId,timestamp:b.timestamp,bids:b.bids.length,asks:b.asks.length})),
  issues:[...new Set(issues)],errors};
}
