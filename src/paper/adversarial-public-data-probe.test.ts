import {describe,expect,it} from 'vitest';
import {probePublicMarket} from './adversarial-public-data-probe.js';

const market=(overrides:any={})=>({conditionId:'c',marketSlug:'m',question:'q',tokens:[{tokenId:'y',outcome:'Yes',price:.5},{tokenId:'n',outcome:'No',price:.5}],active:true,closed:false,acceptingOrders:true,...overrides});
const book=(id:string,ts=1000)=>({tokenId:id,assetId:id,bids:[{price:.4,size:10}],asks:[{price:.6,size:10}],timestamp:ts});

describe('adversarial public data probe',()=>{
 it('collects clean evidence without making an opportunity decision',async()=>{
  const s:any={getClobMarket:async()=>market(),getTokenOrderbook:async(id:string)=>book(id,1000)};
  const r=await probePublicMarket(s,'c',{now:()=>1500,maxBookAgeMs:1000});
  expect(r.issues).toEqual([]);expect((r as any).status).toBeUndefined();expect((r as any).result).toBeUndefined();
 });
 it('fails visibly on missing venue timestamps',async()=>{
  const s:any={getClobMarket:async()=>market(),getTokenOrderbook:async(id:string)=>book(id,0)};
  expect((await probePublicMarket(s,'c',{now:()=>1500})).issues).toContain('BOOK_TIMESTAMP_MISSING');
 });
 it('detects lifecycle and non-binary markets before fetching books',async()=>{
  let fetched=false;const s:any={getClobMarket:async()=>market({active:false,closed:true,acceptingOrders:false,tokens:[{tokenId:'a',outcome:'A',price:.3}]}),getTokenOrderbook:async()=>{fetched=true;return book('a')}};
  const r=await probePublicMarket(s,'c');expect(r.issues).toEqual(expect.arrayContaining(['MARKET_INACTIVE','MARKET_CLOSED','ORDERS_NOT_ACCEPTED','NOT_EXACTLY_TWO_TOKENS']));expect(fetched).toBe(false);
 });
 it('detects malformed prices and cross-book skew',async()=>{
  const s:any={getClobMarket:async()=>market(),getTokenOrderbook:async(id:string)=>id==='y'?{...book(id,1000),asks:[{price:1.2,size:1}]}:book(id,5000)};
  const r=await probePublicMarket(s,'c',{now:()=>5000,maxBookAgeMs:10000,maxBookSkewMs:1000});
  expect(r.issues).toEqual(expect.arrayContaining(['MALFORMED_LEVEL','BOOK_SKEW']));
 });
 it('sanitizes fetch errors',async()=>{
  const s:any={getClobMarket:async()=>market(),getTokenOrderbook:async()=>{throw new Error('api_key=sk-abcdefghijklmnop')}};
  const r=await probePublicMarket(s,'c');expect(r.errors.join(' ')).not.toContain('abcdefghijklmnop');expect(r.issues).toContain('BOOK_FETCH_FAILED');
 });
});
