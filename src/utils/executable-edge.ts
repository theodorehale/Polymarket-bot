import type { PriceLevel } from './price-utils.js';

const USD_EPS = 1e-9;
const BPS_EPS = 1e-9;
const SHARE_EPS = 1e-9;

export type ExecutableArbType = 'long' | 'short';
export type ExecutableSide = 'BUY' | 'SELL';
export interface FillSlice { price: number; shares: number; notionalUsd: number; }
export interface SimulatedFill {
  side: ExecutableSide; requestedShares: number; filledShares: number; fullyFilled: boolean;
  vwap: number; notionalUsd: number; worstPrice: number | null; limitPrice?: number;
  priceConstrained: boolean; levelsConsumed: FillSlice[];
}
export interface BookFreshnessResult {
  fresh: boolean; yesAgeMs: number; noAgeMs: number; skewMs: number;
  maxAgeMs: number; maxSkewMs: number; reasons: string[];
}
export interface ExecutionCostEstimate {
  expectedGasUsd: number; worstCaseGasUsd: number;
  expectedOtherCostsUsd?: number; worstCaseOtherCostsUsd?: number;
}
export interface FeeCurvePoint { price: number; multiplier: number; }
export type FeeModel =
  | { status: 'unknown'; reason?: string }
  | { status: 'known'; kind: 'zero' }
  | { status: 'known'; kind: 'flat_bps'; rateBps: number }
  | { status: 'known'; kind: 'price_curve_bps'; baseRateBps: number; points: FeeCurvePoint[] };
export interface ExecutableBook { bids: PriceLevel[]; asks: PriceLevel[]; timestampMs: number; }
export interface ExecutableEdgeThresholds {
  minExpectedNetProfitUsd?: number; minWorstCaseNetProfitUsd?: number;
  minExpectedNetEdgeBps?: number; minWorstCaseNetEdgeBps?: number;
}
export interface ExecutableQuoteInput {
  type: ExecutableArbType; yesTokenId: string; noTokenId: string;
  yesBook: ExecutableBook; noBook: ExecutableBook; targetPairShares: number;
  yesFee: FeeModel; noFee: FeeModel; costs: ExecutionCostEstimate;
  nowMs: number; maxBookAgeMs: number; maxBookSkewMs: number; maxFutureDriftMs?: number;
  maxAdverseSlippageBps?: number; priceLimits?: { yes?: number; no?: number };
  thresholds?: ExecutableEdgeThresholds;
}
export interface ExecutableLegQuote {
  tokenId: string; side: ExecutableSide; targetShares: number; fullyFillable: boolean;
  expectedVwap: number; expectedNotionalUsd: number; worstPriceConsumed: number | null;
  executionLimitPrice: number; expectedFeeUsd: number | null; worstCaseFeeUsd: number | null;
  depthConsumed: FillSlice[];
}
export interface ExecutableArbQuote {
  type: ExecutableArbType; targetPairShares: number;
  expectedNetProfitUsd: number; worstCaseNetProfitUsd: number;
  expectedNetEdgeBps: number; worstCaseNetEdgeBps: number;
  expectedGrossProfitUsd: number; worstCaseGrossProfitUsd: number;
  expectedFeesUsd: number | null; worstCaseFeesUsd: number | null;
  expectedGasUsd: number; worstCaseGasUsd: number;
  expectedOtherCostsUsd: number; worstCaseOtherCostsUsd: number;
  yesLeg: ExecutableLegQuote; noLeg: ExecutableLegQuote; books: BookFreshnessResult;
  safeToExecute: boolean; rejectionReasons: string[]; createdAt: number;
}
export interface FindSafePairSizeInput extends Omit<ExecutableQuoteInput, 'targetPairShares'> {
  maxPairShares: number; minPairShares?: number; sizeStepShares?: number; maxIterations?: number;
}
export interface RemainingHedgeBudgetInput {
  type: ExecutableArbType; pairShares: number; leg1NotionalUsd: number; leg1FeeUsd: number;
  secondLegFee: FeeModel; remainingFixedCostsUsd: number; minimumFinalNetProfitUsd: number;
  priceStep?: number;
}
export interface HedgeBudgetResult {
  feasible: boolean; targetShares: number; maxBuyPrice?: number; minSellPrice?: number;
  netProfitAtBoundaryUsd?: number; rejectionReasons: string[];
}
export interface BookFreshnessInput {
  nowMs: number; yesTimestampMs: number; noTimestampMs: number;
  maxBookAgeMs: number; maxBookSkewMs: number; maxFutureDriftMs?: number;
}

const nn = (x: number) => Number.isFinite(x) && x >= 0;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
function roundStep(x: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return x;
  const d = Math.min(12, Math.max(0, Math.ceil(-Math.log10(step)) + 2));
  return Number((Math.round(x / step) * step).toFixed(d));
}
function strictGt(x: number, y: number, eps: number) { return Number.isFinite(x) && x > y + eps; }

export function validateBookFreshness(i: BookFreshnessInput): BookFreshnessResult {
  const future = i.maxFutureDriftMs ?? 250;
  const r: string[] = [];
  if (!(Number.isFinite(i.nowMs) && i.nowMs > 0)) r.push('INVALID_NOW');
  if (!(Number.isFinite(i.yesTimestampMs) && i.yesTimestampMs > 0)) r.push('INVALID_YES_TIMESTAMP');
  if (!(Number.isFinite(i.noTimestampMs) && i.noTimestampMs > 0)) r.push('INVALID_NO_TIMESTAMP');
  if (!nn(i.maxBookAgeMs)) r.push('INVALID_MAX_BOOK_AGE');
  if (!nn(i.maxBookSkewMs)) r.push('INVALID_MAX_BOOK_SKEW');
  if (!nn(future)) r.push('INVALID_MAX_FUTURE_DRIFT');
  if (r.length) return { fresh: false, yesAgeMs: Infinity, noAgeMs: Infinity, skewMs: Infinity, maxAgeMs: i.maxBookAgeMs, maxSkewMs: i.maxBookSkewMs, reasons: r };
  const ya = i.nowMs - i.yesTimestampMs, na = i.nowMs - i.noTimestampMs;
  const yesAgeMs = Math.max(0, ya), noAgeMs = Math.max(0, na), skewMs = Math.abs(i.yesTimestampMs - i.noTimestampMs);
  if (ya < -future) r.push('YES_BOOK_TIMESTAMP_IN_FUTURE');
  if (na < -future) r.push('NO_BOOK_TIMESTAMP_IN_FUTURE');
  if (yesAgeMs > i.maxBookAgeMs) r.push('YES_BOOK_STALE');
  if (noAgeMs > i.maxBookAgeMs) r.push('NO_BOOK_STALE');
  if (skewMs > i.maxBookSkewMs) r.push('BOOK_TIMESTAMP_SKEW');
  return { fresh: !r.length, yesAgeMs, noAgeMs, skewMs, maxAgeMs: i.maxBookAgeMs, maxSkewMs: i.maxBookSkewMs, reasons: r };
}

export function simulateExactShareFill(levels: PriceLevel[], targetShares: number, side: ExecutableSide, limitPrice?: number): SimulatedFill {
  const requestedShares = Number.isFinite(targetShares) && targetShares > 0 ? targetShares : 0;
  const xs = levels.filter(x => Number.isFinite(x.price) && Number.isFinite(x.size) && x.price >= 0 && x.size > 0)
    .map(x => ({ ...x })).sort((a, b) => side === 'BUY' ? a.price - b.price : b.price - a.price);
  let filledShares = 0, notionalUsd = 0, worstPrice: number | null = null, priceConstrained = false;
  const levelsConsumed: FillSlice[] = [];
  for (const x of xs) {
    if (filledShares + SHARE_EPS >= requestedShares) break;
    if (limitPrice !== undefined && Number.isFinite(limitPrice)) {
      const blocked = side === 'BUY' ? x.price > limitPrice + USD_EPS : x.price < limitPrice - USD_EPS;
      if (blocked) { priceConstrained = true; break; }
    }
    const shares = Math.min(x.size, requestedShares - filledShares);
    if (shares <= SHARE_EPS) continue;
    const n = shares * x.price;
    levelsConsumed.push({ price: x.price, shares, notionalUsd: n });
    filledShares += shares; notionalUsd += n; worstPrice = x.price;
  }
  const fullyFilled = requestedShares > 0 && filledShares + SHARE_EPS >= requestedShares;
  return { side, requestedShares, filledShares, fullyFilled, vwap: filledShares > 0 ? notionalUsd / filledShares : 0,
    notionalUsd, worstPrice, limitPrice, priceConstrained, levelsConsumed };
}

function feeError(m: FeeModel): string | null {
  if (m.status === 'unknown') return m.reason || 'FEE_UNAVAILABLE';
  if (m.kind === 'zero') return null;
  if (m.kind === 'flat_bps') return nn(m.rateBps) ? null : 'INVALID_FEE_RATE';
  if (!nn(m.baseRateBps) || !m.points.length) return 'INVALID_FEE_CURVE';
  return m.points.every(p => Number.isFinite(p.price) && p.price >= 0 && p.price <= 1 && nn(p.multiplier)) ? null : 'INVALID_FEE_CURVE';
}
function feeAt(m: FeeModel, price: number, shares: number): number | null {
  if (feeError(m)) return null;
  if (m.status === 'unknown') return null;
  if (m.kind === 'zero') return 0;
  const notional = price * shares;
  if (m.kind === 'flat_bps') return notional * m.rateBps / 10_000;
  const ps = [...m.points].sort((a, b) => a.price - b.price);
  const p = clamp(price, 0, 1);
  let mult = ps[0].multiplier;
  if (p >= ps[ps.length - 1].price) mult = ps[ps.length - 1].multiplier;
  else for (let k = 1; k < ps.length; k++) if (p <= ps[k].price) {
    const a = ps[k - 1], b = ps[k], w = b.price - a.price;
    mult = w <= USD_EPS ? Math.max(a.multiplier, b.multiplier) : a.multiplier + (b.multiplier - a.multiplier) * (p - a.price) / w;
    break;
  }
  return notional * m.baseRateBps / 10_000 * mult;
}
function expectedFee(m: FeeModel, f: SimulatedFill): number | null {
  if (feeError(m)) return null;
  let total = 0;
  for (const s of f.levelsConsumed) { const x = feeAt(m, s.price, s.shares); if (x === null) return null; total += x; }
  return total;
}
function worstFee(m: FeeModel, f: SimulatedFill, limit: number): number | null {
  if (feeError(m)) return null;
  if (m.status === 'unknown') return null;
  if (m.kind === 'zero') return 0;
  const maxPrice = Math.max(limit, ...f.levelsConsumed.map(x => x.price), 0);
  if (m.kind === 'flat_bps') return f.requestedShares * maxPrice * m.rateBps / 10_000;
  const maxMult = Math.max(...m.points.map(x => x.multiplier), 0);
  return f.requestedShares * maxPrice * m.baseRateBps / 10_000 * maxMult;
}
function limitFor(f: SimulatedFill, side: ExecutableSide, bps: number) {
  const p = f.worstPrice ?? f.vwap, d = Math.max(0, bps) / 10_000;
  return side === 'BUY' ? clamp(p * (1 + d), 0, 1) : clamp(p * (1 - d), 0, 1);
}

export function calculateExecutableQuote(i: ExecutableQuoteInput): ExecutableArbQuote {
  const reasons: string[] = [], side: ExecutableSide = i.type === 'long' ? 'BUY' : 'SELL', s = i.targetPairShares;
  const books = validateBookFreshness({ nowMs: i.nowMs, yesTimestampMs: i.yesBook.timestampMs, noTimestampMs: i.noBook.timestampMs,
    maxBookAgeMs: i.maxBookAgeMs, maxBookSkewMs: i.maxBookSkewMs, maxFutureDriftMs: i.maxFutureDriftMs });
  if (!books.fresh) reasons.push(...books.reasons);
  if (!(Number.isFinite(s) && s > 0)) reasons.push('INVALID_TARGET_PAIR_SHARES');
  if (![i.costs.expectedGasUsd, i.costs.worstCaseGasUsd, i.costs.expectedOtherCostsUsd ?? 0, i.costs.worstCaseOtherCostsUsd ?? 0].every(nn)) reasons.push('INVALID_EXECUTION_COSTS');
  const ye = feeError(i.yesFee), ne = feeError(i.noFee); if (ye) reasons.push('YES_' + ye); if (ne) reasons.push('NO_' + ne);
  const yl = side === 'BUY' ? i.yesBook.asks : i.yesBook.bids, nl = side === 'BUY' ? i.noBook.asks : i.noBook.bids;
  const yu = simulateExactShareFill(yl, s, side), nu = simulateExactShareFill(nl, s, side), slip = i.maxAdverseSlippageBps ?? 0;
  const yLimit = i.priceLimits?.yes ?? limitFor(yu, side, slip), nLimit = i.priceLimits?.no ?? limitFor(nu, side, slip);
  if (!(Number.isFinite(yLimit) && yLimit >= 0 && yLimit <= 1)) reasons.push('INVALID_YES_LIMIT_PRICE');
  if (!(Number.isFinite(nLimit) && nLimit >= 0 && nLimit <= 1)) reasons.push('INVALID_NO_LIMIT_PRICE');
  const yf = simulateExactShareFill(yl, s, side, yLimit), nf = simulateExactShareFill(nl, s, side, nLimit);
  if (!yf.fullyFilled) reasons.push('INSUFFICIENT_YES_DEPTH'); if (!nf.fullyFilled) reasons.push('INSUFFICIENT_NO_DEPTH');
  const yef = expectedFee(i.yesFee, yf), nef = expectedFee(i.noFee, nf), ywf = worstFee(i.yesFee, yf, yLimit), nwf = worstFee(i.noFee, nf, nLimit);
  const expectedFeesUsd = yef === null || nef === null ? null : yef + nef, worstCaseFeesUsd = ywf === null || nwf === null ? null : ywf + nwf;
  const eo = i.costs.expectedOtherCostsUsd ?? 0, wo = i.costs.worstCaseOtherCostsUsd ?? 0, pair = Number.isFinite(s) && s > 0 ? s : 0;
  const expTwo = yf.notionalUsd + nf.notionalUsd, worstTwo = s > 0 ? s * (yLimit + nLimit) : 0;
  const eg = i.type === 'long' ? pair - expTwo : expTwo - pair, wg = i.type === 'long' ? pair - worstTwo : worstTwo - pair;
  const en = expectedFeesUsd === null ? -Infinity : eg - expectedFeesUsd - i.costs.expectedGasUsd - eo;
  const wn = worstCaseFeesUsd === null ? -Infinity : wg - worstCaseFeesUsd - i.costs.worstCaseGasUsd - wo;
  const eb = pair > 0 && Number.isFinite(en) ? en / pair * 10_000 : -Infinity, wb = pair > 0 && Number.isFinite(wn) ? wn / pair * 10_000 : -Infinity;
  const t = i.thresholds ?? {}, ep = t.minExpectedNetProfitUsd ?? 0, wp = t.minWorstCaseNetProfitUsd ?? 0, ee = t.minExpectedNetEdgeBps ?? 0, we = t.minWorstCaseNetEdgeBps ?? 0;
  if (!strictGt(en, ep, USD_EPS)) reasons.push('EXPECTED_NET_PROFIT_BELOW_THRESHOLD');
  if (!strictGt(wn, wp, USD_EPS)) reasons.push('WORST_CASE_NET_PROFIT_BELOW_THRESHOLD');
  if (!strictGt(eb, ee, BPS_EPS)) reasons.push('EXPECTED_NET_EDGE_BELOW_THRESHOLD');
  if (!strictGt(wb, we, BPS_EPS)) reasons.push('WORST_CASE_NET_EDGE_BELOW_THRESHOLD');
  const leg = (tokenId: string, f: SimulatedFill, limit: number, ef: number | null, wf: number | null): ExecutableLegQuote => ({
    tokenId, side, targetShares: s, fullyFillable: f.fullyFilled, expectedVwap: f.vwap, expectedNotionalUsd: f.notionalUsd,
    worstPriceConsumed: f.worstPrice, executionLimitPrice: limit, expectedFeeUsd: ef, worstCaseFeeUsd: wf, depthConsumed: f.levelsConsumed });
  return { type: i.type, targetPairShares: s, expectedNetProfitUsd: en, worstCaseNetProfitUsd: wn, expectedNetEdgeBps: eb, worstCaseNetEdgeBps: wb,
    expectedGrossProfitUsd: eg, worstCaseGrossProfitUsd: wg, expectedFeesUsd, worstCaseFeesUsd, expectedGasUsd: i.costs.expectedGasUsd,
    worstCaseGasUsd: i.costs.worstCaseGasUsd, expectedOtherCostsUsd: eo, worstCaseOtherCostsUsd: wo,
    yesLeg: leg(i.yesTokenId, yf, yLimit, yef, ywf), noLeg: leg(i.noTokenId, nf, nLimit, nef, nwf), books,
    safeToExecute: reasons.length === 0, rejectionReasons: [...new Set(reasons)], createdAt: i.nowMs };
}

export function findSafePairSize(i: FindSafePairSizeInput): ExecutableArbQuote | null {
  const min = i.minPairShares ?? 0.01, step = i.sizeStepShares ?? 0.01, maxIter = i.maxIterations ?? 100_000;
  if (!(Number.isFinite(i.maxPairShares) && i.maxPairShares > 0 && Number.isFinite(min) && min > 0 && Number.isFinite(step) && step > 0 && Number.isInteger(maxIter) && maxIter > 0)) return null;
  let x = i.maxPairShares;
  for (let n = 0; x + SHARE_EPS >= min && n < maxIter; n++) {
    const size = roundStep(x, step); if (size + SHARE_EPS >= min) { const q = calculateExecutableQuote({ ...i, targetPairShares: size }); if (q.safeToExecute) return q; }
    x = size - step;
  }
  return null;
}

export function computeRemainingHedgeBudget(i: RemainingHedgeBudgetInput): HedgeBudgetResult {
  const r: string[] = [], step = i.priceStep ?? 0.0001;
  if (!(Number.isFinite(i.pairShares) && i.pairShares > 0)) r.push('INVALID_PAIR_SHARES');
  if (!nn(i.leg1NotionalUsd)) r.push('INVALID_LEG1_NOTIONAL'); if (!nn(i.leg1FeeUsd)) r.push('INVALID_LEG1_FEE');
  if (!nn(i.remainingFixedCostsUsd)) r.push('INVALID_REMAINING_COSTS'); if (!Number.isFinite(i.minimumFinalNetProfitUsd)) r.push('INVALID_MIN_FINAL_PROFIT');
  if (!(Number.isFinite(step) && step > 0 && step <= 1)) r.push('INVALID_PRICE_STEP'); const fe = feeError(i.secondLegFee); if (fe) r.push('SECOND_LEG_' + fe);
  if (r.length) return { feasible: false, targetShares: i.pairShares, rejectionReasons: r };
  const s = i.pairShares, count = Math.ceil(1 / step);
  if (i.type === 'long') for (let n = count; n >= 0; n--) {
    const p = clamp(roundStep(n * step, step), 0, 1), fee = feeAt(i.secondLegFee, p, s); if (fee === null) break;
    const net = s - i.leg1NotionalUsd - s * p - i.leg1FeeUsd - fee - i.remainingFixedCostsUsd;
    if (strictGt(net, i.minimumFinalNetProfitUsd, USD_EPS)) return { feasible: true, targetShares: s, maxBuyPrice: p, netProfitAtBoundaryUsd: net, rejectionReasons: [] };
  }
  if (i.type === 'short') for (let n = 0; n <= count; n++) {
    const p = clamp(roundStep(n * step, step), 0, 1), fee = feeAt(i.secondLegFee, p, s); if (fee === null) break;
    const net = i.leg1NotionalUsd + s * p - s - i.leg1FeeUsd - fee - i.remainingFixedCostsUsd;
    if (strictGt(net, i.minimumFinalNetProfitUsd, USD_EPS)) return { feasible: true, targetShares: s, minSellPrice: p, netProfitAtBoundaryUsd: net, rejectionReasons: [] };
  }
  return { feasible: false, targetShares: s, rejectionReasons: ['NO_SAFE_HEDGE_PRICE'] };
}
