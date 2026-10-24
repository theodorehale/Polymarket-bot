import { describe, it, expect } from 'vitest';
import { pricePaperLeg, closedPaperPnl, type PaperLeg } from './fees-and-pnl.js';
const leg = (atMs: number, price: number): PaperLeg => ({marketId:'m',tokenId:'t',atMs,
  levels:[{price,size:10}],fee:{model:'polymarket-share-price-exponent-1',marketId:'m',tokenId:'t',rate:0.07,
  observedAtMs:900,validUntilMs:3000,sourceUrl:'https://clob.polymarket.com/markets/m'}});
describe('fee-evidenced paper cashflow',()=>{
  it('charges each depth level rather than applying nonlinear fee to VWAP',()=>{
    const x=leg(1000,.2); x.levels=[{price:.2,size:5},{price:.8,size:5}];
    expect(pricePaperLeg(x).feeUsd).toBeGreaterThanOrEqual(.112);
    expect(pricePaperLeg(x).feeUsd).toBeLessThanOrEqual(.11202);
  });
  it('turns a small gross gain into a loss after both taker fees',()=>{
    const p=closedPaperPnl(leg(1000,.5),leg(2000,.51));
    expect(p.grossPnlUsd).toBeCloseTo(.1); expect(p.netPnlUsd).toBeLessThan(0);
  });
  it.each(['rate','observedAtMs','validUntilMs'] as const)('rejects NaN %s',key=>{
    const x=leg(1000,.5); x.fee[key]=NaN; expect(()=>pricePaperLeg(x)).toThrow();
  });
  it('rejects future, expired, wrong-token and missing fee evidence',()=>{
    for(const mutate of [(x:PaperLeg)=>x.fee.observedAtMs=1001,(x:PaperLeg)=>x.fee.validUntilMs=999,
      (x:PaperLeg)=>x.fee.tokenId='other',(x:PaperLeg)=>x.fee.sourceUrl='https://clob.polymarket.com.evil.invalid/']) {
      const x=leg(1000,.5); mutate(x); expect(()=>pricePaperLeg(x)).toThrow('UNVERIFIED_FEE_EVIDENCE');
    }
  });
  it('refuses to report an open position as closed profit',()=>{
    const exit=leg(2000,.7); exit.levels[0].size=9; expect(()=>closedPaperPnl(leg(1000,.5),exit)).toThrow('POSITION_NOT_CLOSED');
  });
  it('counts explicit evidenced zero fee without substituting a default',()=>{
    const x=leg(1000,.5); x.fee.rate=0; expect(pricePaperLeg(x).feeUsd).toBe(0);
  });
});
