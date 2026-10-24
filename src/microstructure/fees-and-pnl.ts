/** Offline paper accounting only. No network, accounts, or order submission. */
export interface FeeEvidence {
  model: 'polymarket-share-price-exponent-1';
  marketId: string;
  tokenId: string;
  rate: number;
  observedAtMs: number;
  validUntilMs: number;
  sourceUrl: string;
}
export interface PaperLeg {
  marketId: string;
  tokenId: string;
  atMs: number;
  levels: Array<{ price: number; size: number }>;
  fee: FeeEvidence;
}
function validSource(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && ['clob.polymarket.com', 'gamma-api.polymarket.com'].includes(url.hostname) && !url.username && !url.password; } catch { return false; }
}
function validPositive(n: number): boolean { return Number.isFinite(n) && n > 0; }
/** The schedule is supplied evidence, never inferred from the crypto category.
 * Formula documented at https://docs.polymarket.com/trading/fees.
 * Round UP per price level to five decimals for conservative paper costs.
 * Rebates are zero until actually evidenced. Fees are USD-equivalent estimates.
 */
export function pricePaperLeg(leg: PaperLeg): { shares: number; notionalUsd: number; feeUsd: number } {
  const f = leg.fee;
  if (!leg.marketId || !leg.tokenId || !Number.isFinite(leg.atMs) || !f ||
      f.model !== 'polymarket-share-price-exponent-1' || f.marketId !== leg.marketId || f.tokenId !== leg.tokenId ||
      !Number.isFinite(f.rate) || f.rate < 0 || f.rate > 1 ||
      !Number.isFinite(f.observedAtMs) || !Number.isFinite(f.validUntilMs) ||
      f.observedAtMs > leg.atMs || f.validUntilMs < leg.atMs ||
      !validSource(f.sourceUrl)) {
    throw new Error('UNVERIFIED_FEE_EVIDENCE');
  }
  if (!Array.isArray(leg.levels) || !leg.levels.length || leg.levels.some(l =>
    !validPositive(l.price) || l.price >= 1 || !validPositive(l.size))) throw new Error('INVALID_FILL_LEVELS');
  let shares = 0, notionalUsd = 0, feeUsd = 0;
  for (const l of leg.levels) {
    shares += l.size;
    notionalUsd += l.size * l.price;
    feeUsd += Math.ceil(l.size * f.rate * l.price * (1 - l.price) * 100000) / 100000;
  }
  if (![shares, notionalUsd, feeUsd].every(Number.isFinite)) throw new Error('ACCOUNTING_OVERFLOW');
  return { shares, notionalUsd, feeUsd };
}
/** Closed BUY -> SELL paper cashflow; never use model fair value as proceeds.
 * Caller must establish executable entry/exit fills. This is not live revenue.
 */
export function closedPaperPnl(entry: PaperLeg, exit: PaperLeg, otherCostsUsd = 0) {
  if (entry.marketId !== exit.marketId || entry.tokenId !== exit.tokenId || exit.atMs <= entry.atMs ||
      !Number.isFinite(otherCostsUsd) || otherCostsUsd < 0) throw new Error('INVALID_ROUND_TRIP');
  const buy = pricePaperLeg(entry), sell = pricePaperLeg(exit);
  if (Math.abs(buy.shares - sell.shares) > 1e-9) throw new Error('POSITION_NOT_CLOSED');
  const grossPnlUsd = sell.notionalUsd - buy.notionalUsd;
  const feesUsd = buy.feeUsd + sell.feeUsd;
  if (![grossPnlUsd, feesUsd, grossPnlUsd - feesUsd - otherCostsUsd].every(Number.isFinite)) throw new Error('ACCOUNTING_OVERFLOW');
  return { accounting: 'CLOSED_PAPER_CASHFLOW' as const, shares: buy.shares, grossPnlUsd,
    feesUsd, otherCostsUsd, netPnlUsd: grossPnlUsd - feesUsd - otherCostsUsd };
}
