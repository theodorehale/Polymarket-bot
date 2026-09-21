/**
 * Phase 4.1 single-market live public-data probe runner.
 * Public CLOB reads only: no private key, wallet, signer, Jev, or order submission.
 */
import { MarketService } from '../src/services/market-service.js';
import { RateLimiter } from '../src/core/rate-limiter.js';
import { Cache } from '../src/core/cache.js';
import { LegacyCacheWrapper } from '../src/core/unified-cache.js';
import { probePublicMarket } from '../src/paper/adversarial-public-data-probe.js';
import { sanitizeExternalError } from '../src/research/security-boundary.js';

async function main(){
  if(process.env.POLYMARKET_PRIVATE_KEY||process.env.PRIVATE_KEY){
    throw new Error('PROBE_REFUSES_PRIVATE_KEY_ENVIRONMENT');
  }
  const rateLimiter=new RateLimiter();
  const cache=new LegacyCacheWrapper(new Cache());
  const service=new MarketService(undefined,undefined,rateLimiter,cache,undefined);
  const MAX_DISCOVERY_PAGES=5;
  let cursor: string | undefined;
  let pagesScanned=0;
  let marketsReturned=0;
  let selected: Awaited<ReturnType<MarketService['getClobMarkets']>>['markets'][number] | undefined;
  const diagnostic={
    active:0,notClosed:0,acceptingOrders:0,twoTokens:0,nonEmptyTokenMetadata:0,allConditions:0,
    activeAndNotClosed:0,activeAndAcceptingOrders:0,notClosedAndAcceptingOrders:0,
    activeNotClosedAndAcceptingOrders:0,tradeStateAndTokenMetadata:0,
    stateCombinations:{} as Record<string,number>,
  };
  do {
    const page=await service.getClobMarkets(cursor);
    pagesScanned++;
    marketsReturned+=page.markets.length;
    for(const m of page.markets){
      const active=m.active===true,notClosed=m.closed===false,accepting=m.acceptingOrders===true,two=m.tokens.length===2,metadata=m.tokens.every(t=>Boolean(t.tokenId&&t.outcome.trim()));
      if(active) diagnostic.active++;
      if(notClosed) diagnostic.notClosed++;
      if(accepting) diagnostic.acceptingOrders++;
      if(two) diagnostic.twoTokens++;
      if(metadata) diagnostic.nonEmptyTokenMetadata++;
      if(active&&notClosed) diagnostic.activeAndNotClosed++;
      if(active&&accepting) diagnostic.activeAndAcceptingOrders++;
      if(notClosed&&accepting) diagnostic.notClosedAndAcceptingOrders++;
      if(active&&notClosed&&accepting) diagnostic.activeNotClosedAndAcceptingOrders++;
      if(active&&notClosed&&accepting&&metadata) diagnostic.tradeStateAndTokenMetadata++;
      if(active&&notClosed&&accepting&&two&&metadata) diagnostic.allConditions++;
      const stateKey=`active=${active}|closed=${m.closed===true}|accepting=${accepting}`;
      diagnostic.stateCombinations[stateKey]=(diagnostic.stateCombinations[stateKey]??0)+1;
    }
    selected=page.markets.find(m=>m.active&&!m.closed&&m.acceptingOrders&&m.tokens.length===2&&m.tokens.every(t=>t.tokenId&&t.outcome.trim()));
    if(selected) break;
    const next=page.nextCursor;
    if(!next||next===cursor) break;
    cursor=next;
  } while(pagesScanned<MAX_DISCOVERY_PAGES);
  if(!selected){
    process.stdout.write(JSON.stringify({discovery:{pagesScanned,marketsReturned,diagnostic}},null,2)+'\n');
    throw new Error(`NO_ELIGIBLE_PUBLIC_MARKET_FOUND_AFTER_${pagesScanned}_PAGES_${marketsReturned}_MARKETS`);
  }
  const record=await probePublicMarket(service,selected.conditionId);
  process.stdout.write(JSON.stringify({discovery:{pagesScanned,marketsReturned,diagnostic,selected:{conditionId:selected.conditionId,slug:selected.marketSlug,question:selected.question}},probe:record},null,2)+'\n');
}
main().catch(e=>{process.stderr.write('PROBE_FAILED '+sanitizeExternalError(e)+'\n');process.exitCode=1;});
