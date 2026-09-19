import { describe, expect, it } from 'vitest';
import {
  calculateExecutableQuote,
  computeRemainingHedgeBudget,
  findSafePairSize,
  simulateExactShareFill,
  validateBookFreshness,
  type ExecutableQuoteInput,
  type FeeModel,
} from './executable-edge.js';

const ZERO_FEE: FeeModel = { status: 'known', kind: 'zero' };

function baseLongInput(overrides: Partial<ExecutableQuoteInput> = {}): ExecutableQuoteInput {
  const nowMs = 1_700_000_000_000;
  return {
    type: 'long',
    yesTokenId: 'YES',
    noTokenId: 'NO',
    yesBook: {
      bids: [{ price: 0.44, size: 100 }],
      asks: [{ price: 0.45, size: 100 }],
      timestampMs: nowMs - 100,
    },
    noBook: {
      bids: [{ price: 0.44, size: 100 }],
      asks: [{ price: 0.45, size: 100 }],
      timestampMs: nowMs - 120,
    },
    targetPairShares: 10,
    yesFee: ZERO_FEE,
    noFee: ZERO_FEE,
    costs: { expectedGasUsd: 0, worstCaseGasUsd: 0 },
    nowMs,
    maxBookAgeMs: 1_000,
    maxBookSkewMs: 500,
    maxAdverseSlippageBps: 0,
    thresholds: {
      minExpectedNetProfitUsd: 0,
      minWorstCaseNetProfitUsd: 0,
      minExpectedNetEdgeBps: 0,
      minWorstCaseNetEdgeBps: 0,
    },
    ...overrides,
  };
}

function baseShortInput(overrides: Partial<ExecutableQuoteInput> = {}): ExecutableQuoteInput {
  const nowMs = 1_700_000_000_000;
  return {
    type: 'short',
    yesTokenId: 'YES',
    noTokenId: 'NO',
    yesBook: {
      bids: [{ price: 0.60, size: 100 }],
      asks: [{ price: 0.61, size: 100 }],
      timestampMs: nowMs - 100,
    },
    noBook: {
      bids: [{ price: 0.55, size: 100 }],
      asks: [{ price: 0.56, size: 100 }],
      timestampMs: nowMs - 120,
    },
    targetPairShares: 10,
    yesFee: ZERO_FEE,
    noFee: ZERO_FEE,
    costs: { expectedGasUsd: 0, worstCaseGasUsd: 0 },
    nowMs,
    maxBookAgeMs: 1_000,
    maxBookSkewMs: 500,
    maxAdverseSlippageBps: 0,
    thresholds: {
      minExpectedNetProfitUsd: 0,
      minWorstCaseNetProfitUsd: 0,
      minExpectedNetEdgeBps: 0,
      minWorstCaseNetEdgeBps: 0,
    },
    ...overrides,
  };
}

describe('simulateExactShareFill', () => {
  it('fills a single level exactly', () => {
    const r = simulateExactShareFill([{ price: 0.4, size: 10 }], 5, 'BUY');
    expect(r.fullyFilled).toBe(true);
    expect(r.filledShares).toBeCloseTo(5, 12);
    expect(r.vwap).toBeCloseTo(0.4, 12);
    expect(r.notionalUsd).toBeCloseTo(2, 12);
  });

  it('calculates multi-level VWAP using exact shares', () => {
    const r = simulateExactShareFill([{ price: 0.4, size: 2 }, { price: 0.5, size: 3 }], 5, 'BUY');
    expect(r.fullyFilled).toBe(true);
    expect(r.vwap).toBeCloseTo(0.46, 12);
    expect(r.notionalUsd).toBeCloseTo(2.3, 12);
    expect(r.levelsConsumed).toHaveLength(2);
  });

  it('calculates multi-level SELL VWAP from best bids downward', () => {
    const r = simulateExactShareFill([{ price: 0.6, size: 2 }, { price: 0.5, size: 3 }], 5, 'SELL');
    expect(r.fullyFilled).toBe(true);
    expect(r.vwap).toBeCloseTo(0.54, 12);
    expect(r.notionalUsd).toBeCloseTo(2.7, 12);
    expect(r.levelsConsumed).toHaveLength(2);
  });

  it('fails closed on insufficient depth', () => {
    const r = simulateExactShareFill([{ price: 0.4, size: 4 }], 5, 'BUY');
    expect(r.fullyFilled).toBe(false);
    expect(r.filledShares).toBeCloseTo(4, 12);
  });

  it('enforces a BUY cap', () => {
    const r = simulateExactShareFill([{ price: 0.4, size: 2 }, { price: 0.5, size: 3 }], 5, 'BUY', 0.45);
    expect(r.fullyFilled).toBe(false);
    expect(r.filledShares).toBeCloseTo(2, 12);
    expect(r.priceConstrained).toBe(true);
  });

  it('enforces a SELL floor', () => {
    const r = simulateExactShareFill([{ price: 0.6, size: 2 }, { price: 0.5, size: 3 }], 5, 'SELL', 0.55);
    expect(r.fullyFilled).toBe(false);
    expect(r.filledShares).toBeCloseTo(2, 12);
    expect(r.priceConstrained).toBe(true);
  });

  it.each([
    ['price above one', 1.01],
    ['negative price', -0.01],
    ['NaN price', Number.NaN],
    ['Infinity price', Number.POSITIVE_INFINITY],
  ])('fails closed on malformed %s', (_label, price) => {
    const r = simulateExactShareFill([{ price, size: 10 }, { price: 0.5, size: 10 }], 5, 'BUY');
    expect(r.invalidPrice).toBe(true);
    expect(r.fullyFilled).toBe(false);
    expect(r.filledShares).toBe(0);
    expect(r.levelsConsumed).toHaveLength(0);
  });
});

describe('validateBookFreshness', () => {
  const nowMs = 1_700_000_000_000;

  it('rejects a stale YES book', () => {
    const r = validateBookFreshness({ nowMs, yesTimestampMs: nowMs - 2_000, noTimestampMs: nowMs - 100, maxBookAgeMs: 1_000, maxBookSkewMs: 5_000 });
    expect(r.fresh).toBe(false);
    expect(r.reasons).toContain('YES_BOOK_STALE');
  });

  it('rejects a stale NO book', () => {
    const r = validateBookFreshness({ nowMs, yesTimestampMs: nowMs - 100, noTimestampMs: nowMs - 2_000, maxBookAgeMs: 1_000, maxBookSkewMs: 5_000 });
    expect(r.fresh).toBe(false);
    expect(r.reasons).toContain('NO_BOOK_STALE');
  });

  it('rejects excessive YES/NO timestamp skew', () => {
    const r = validateBookFreshness({ nowMs, yesTimestampMs: nowMs - 100, noTimestampMs: nowMs - 800, maxBookAgeMs: 1_000, maxBookSkewMs: 500 });
    expect(r.fresh).toBe(false);
    expect(r.reasons).toContain('BOOK_TIMESTAMP_SKEW');
  });
});

describe('calculateExecutableQuote', () => {
  it('targets exactly equal YES/NO pair shares', () => {
    const q = calculateExecutableQuote(baseLongInput({ targetPairShares: 7 }));
    expect(q.yesLeg.targetShares).toBeCloseTo(7, 12);
    expect(q.noLeg.targetShares).toBeCloseTo(7, 12);
    expect(q.safeToExecute).toBe(true);
  });

  it('can have positive expected profit but negative worst-case profit', () => {
    const q = calculateExecutableQuote(baseLongInput({ maxAdverseSlippageBps: 1_500 }));
    expect(q.expectedNetProfitUsd).toBeGreaterThan(0);
    expect(q.worstCaseNetProfitUsd).toBeLessThan(0);
    expect(q.safeToExecute).toBe(false);
    expect(q.rejectionReasons).toContain('WORST_CASE_NET_PROFIT_BELOW_THRESHOLD');
  });

  it('applies a dynamic non-zero price-curve fee', () => {
    const dynamicFee: FeeModel = {
      status: 'known',
      kind: 'price_curve_bps',
      baseRateBps: 100,
      points: [{ price: 0, multiplier: 0.5 }, { price: 0.5, multiplier: 1 }, { price: 1, multiplier: 0.5 }],
    };
    const q = calculateExecutableQuote(baseLongInput({ yesFee: dynamicFee, noFee: dynamicFee }));
    expect(q.expectedFeesUsd ?? 0).toBeGreaterThan(0);
    expect(q.expectedNetProfitUsd).toBeLessThan(q.expectedGrossProfitUsd);
    expect(q.safeToExecute).toBe(true);
  });

  it('fails closed when fee data is unavailable instead of treating it as zero', () => {
    const q = calculateExecutableQuote(baseLongInput({ yesFee: { status: 'unknown', reason: 'VENUE_FEE_UNAVAILABLE' } }));
    expect(q.safeToExecute).toBe(false);
    expect(q.expectedFeesUsd).toBeNull();
    expect(q.rejectionReasons).toContain('YES_VENUE_FEE_UNAVAILABLE');
  });

  it('rejects when gas eats the edge', () => {
    const q = calculateExecutableQuote(baseLongInput({
      yesBook: { bids: [{ price: 0.48, size: 100 }], asks: [{ price: 0.49, size: 100 }], timestampMs: 1_699_999_999_900 },
      noBook: { bids: [{ price: 0.48, size: 100 }], asks: [{ price: 0.49, size: 100 }], timestampMs: 1_699_999_999_900 },
      costs: { expectedGasUsd: 0.25, worstCaseGasUsd: 0.25 },
    }));
    expect(q.expectedGrossProfitUsd).toBeCloseTo(0.2, 12);
    expect(q.expectedNetProfitUsd).toBeLessThan(0);
    expect(q.safeToExecute).toBe(false);
  });

  it('regression: rejects when top level is profitable but full depth VWAP is not', () => {
    const nowMs = 1_700_000_000_000;
    const flatFee: FeeModel = { status: 'known', kind: 'flat_bps', rateBps: 10 };
    const q = calculateExecutableQuote(baseLongInput({
      nowMs,
      targetPairShares: 10,
      yesBook: { bids: [{ price: 0.44, size: 10 }], asks: [{ price: 0.45, size: 1 }, { price: 0.55, size: 9 }], timestampMs: nowMs - 50 },
      noBook: { bids: [{ price: 0.44, size: 10 }], asks: [{ price: 0.45, size: 1 }, { price: 0.55, size: 9 }], timestampMs: nowMs - 60 },
      yesFee: flatFee,
      noFee: flatFee,
      costs: { expectedGasUsd: 0.05, worstCaseGasUsd: 0.05 },
      maxAdverseSlippageBps: 100,
    }));
    expect(q.yesLeg.expectedVwap).toBeCloseTo(0.54, 12);
    expect(q.noLeg.expectedVwap).toBeCloseTo(0.54, 12);
    expect(q.expectedNetProfitUsd).toBeLessThan(0);
    expect(q.worstCaseNetProfitUsd).toBeLessThan(0);
    expect(q.safeToExecute).toBe(false);
  });

  it('finds the largest pair size that survives the complete worst-case gate', () => {
    const nowMs = 1_700_000_000_000;
    const q = findSafePairSize({
      ...baseLongInput({
        nowMs,
        yesBook: { bids: [{ price: 0.44, size: 10 }], asks: [{ price: 0.45, size: 5 }, { price: 0.58, size: 5 }], timestampMs: nowMs - 50 },
        noBook: { bids: [{ price: 0.44, size: 10 }], asks: [{ price: 0.45, size: 5 }, { price: 0.58, size: 5 }], timestampMs: nowMs - 50 },
      }),
      maxPairShares: 10,
      minPairShares: 1,
      sizeStepShares: 1,
    });
    expect(q).not.toBeNull();
    expect(q?.targetPairShares).toBe(5);
    expect(q?.safeToExecute).toBe(true);
  });

  it('uses strict threshold boundaries', () => {
    const a = calculateExecutableQuote(baseLongInput({ thresholds: { minExpectedNetProfitUsd: 1, minWorstCaseNetProfitUsd: 1, minExpectedNetEdgeBps: 0, minWorstCaseNetEdgeBps: 0 } }));
    expect(a.expectedNetProfitUsd).toBeCloseTo(1, 12);
    expect(a.safeToExecute).toBe(false);
    const b = calculateExecutableQuote(baseLongInput({ thresholds: { minExpectedNetProfitUsd: 0.99, minWorstCaseNetProfitUsd: 0.99, minExpectedNetEdgeBps: 0, minWorstCaseNetEdgeBps: 0 } }));
    expect(b.safeToExecute).toBe(true);
  });

  it('does not promote microscopic floating-point edge to a safe trade', () => {
    const nowMs = 1_700_000_000_000;
    const q = calculateExecutableQuote(baseLongInput({
      targetPairShares: 1,
      yesBook: { bids: [{ price: 0.49, size: 1 }], asks: [{ price: 0.5, size: 1 }], timestampMs: nowMs - 10 },
      noBook: { bids: [{ price: 0.49, size: 1 }], asks: [{ price: 0.4999999995, size: 1 }], timestampMs: nowMs - 10 },
    }));
    expect(q.expectedNetProfitUsd).toBeGreaterThan(0);
    expect(q.expectedNetProfitUsd).toBeLessThan(1e-9);
    expect(q.safeToExecute).toBe(false);
  });

  it.each([
    ['above one', 1.01],
    ['negative', -0.01],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects malformed YES book price: %s', (_label, price) => {
    const input = baseLongInput();
    const q = calculateExecutableQuote({
      ...input,
      yesBook: { ...input.yesBook, asks: [{ price, size: 10 }, ...input.yesBook.asks] },
    });
    expect(q.safeToExecute).toBe(false);
    expect(q.rejectionReasons).toContain('INVALID_YES_BOOK_PRICE');
  });

  it('rejects malformed NO book price without filtering it away', () => {
    const input = baseLongInput();
    const q = calculateExecutableQuote({
      ...input,
      noBook: { ...input.noBook, bids: [{ price: 1.2, size: 10 }, ...input.noBook.bids] },
    });
    expect(q.safeToExecute).toBe(false);
    expect(q.rejectionReasons).toContain('INVALID_NO_BOOK_PRICE');
  });

  it('rejects when worst-case gas is below expected gas', () => {
    const q = calculateExecutableQuote(baseLongInput({
      costs: { expectedGasUsd: 0.2, worstCaseGasUsd: 0.1 },
    }));
    expect(q.safeToExecute).toBe(false);
    expect(q.rejectionReasons).toContain('WORST_CASE_GAS_LT_EXPECTED');
  });

  it('rejects when worst-case other costs are below expected other costs', () => {
    const q = calculateExecutableQuote(baseLongInput({
      costs: { expectedGasUsd: 0, worstCaseGasUsd: 0, expectedOtherCostsUsd: 0.2, worstCaseOtherCostsUsd: 0.1 },
    }));
    expect(q.safeToExecute).toBe(false);
    expect(q.rejectionReasons).toContain('WORST_CASE_OTHER_COSTS_LT_EXPECTED');
  });
});

describe('calculateExecutableQuote short arbitrage', () => {
  it('accepts a profitable short quote', () => {
    const q = calculateExecutableQuote(baseShortInput());
    expect(q.expectedGrossProfitUsd).toBeCloseTo(1.5, 12);
    expect(q.expectedNetProfitUsd).toBeGreaterThan(0);
    expect(q.safeToExecute).toBe(true);
  });

  it('uses multi-level SELL VWAP for both legs', () => {
    const nowMs = 1_700_000_000_000;
    const q = calculateExecutableQuote(baseShortInput({
      targetPairShares: 5,
      yesBook: { bids: [{ price: 0.65, size: 2 }, { price: 0.55, size: 3 }], asks: [{ price: 0.66, size: 10 }], timestampMs: nowMs - 20 },
      noBook: { bids: [{ price: 0.60, size: 1 }, { price: 0.50, size: 4 }], asks: [{ price: 0.61, size: 10 }], timestampMs: nowMs - 20 },
    }));
    expect(q.yesLeg.expectedVwap).toBeCloseTo(0.59, 12);
    expect(q.noLeg.expectedVwap).toBeCloseTo(0.52, 12);
    expect(q.safeToExecute).toBe(true);
  });

  it('rejects when short worst-case floors destroy the edge', () => {
    const q = calculateExecutableQuote(baseShortInput({ maxAdverseSlippageBps: 1_500 }));
    expect(q.expectedNetProfitUsd).toBeGreaterThan(0);
    expect(q.worstCaseNetProfitUsd).toBeLessThan(0);
    expect(q.safeToExecute).toBe(false);
    expect(q.rejectionReasons).toContain('WORST_CASE_NET_PROFIT_BELOW_THRESHOLD');
  });

  it('rejects when short fees eat the edge', () => {
    const fee: FeeModel = { status: 'known', kind: 'flat_bps', rateBps: 200 };
    const nowMs = 1_700_000_000_000;
    const q = calculateExecutableQuote(baseShortInput({
      yesBook: { bids: [{ price: 0.505, size: 100 }], asks: [{ price: 0.51, size: 100 }], timestampMs: nowMs - 10 },
      noBook: { bids: [{ price: 0.505, size: 100 }], asks: [{ price: 0.51, size: 100 }], timestampMs: nowMs - 10 },
      yesFee: fee,
      noFee: fee,
    }));
    expect(q.expectedGrossProfitUsd).toBeGreaterThan(0);
    expect(q.expectedNetProfitUsd).toBeLessThan(0);
    expect(q.safeToExecute).toBe(false);
  });

  it('rejects short quote with insufficient bid depth', () => {
    const input = baseShortInput({ targetPairShares: 10 });
    const q = calculateExecutableQuote({
      ...input,
      noBook: { ...input.noBook, bids: [{ price: 0.55, size: 5 }] },
    });
    expect(q.safeToExecute).toBe(false);
    expect(q.rejectionReasons).toContain('INSUFFICIENT_NO_DEPTH');
  });

  it('targets exact equal YES/NO shares for short quotes', () => {
    const q = calculateExecutableQuote(baseShortInput({ targetPairShares: 7 }));
    expect(q.yesLeg.targetShares).toBeCloseTo(7, 12);
    expect(q.noLeg.targetShares).toBeCloseTo(7, 12);
    expect(q.safeToExecute).toBe(true);
  });
});

describe('computeRemainingHedgeBudget', () => {
  it('computes a strict long hedge buy budget after an actual first-leg fill', () => {
    const r = computeRemainingHedgeBudget({ type: 'long', pairShares: 10, leg1NotionalUsd: 4, leg1FeeUsd: 0, secondLegFee: ZERO_FEE, remainingFixedCostsUsd: 0, minimumFinalNetProfitUsd: 1, priceStep: 0.01 });
    expect(r.feasible).toBe(true);
    expect(r.maxBuyPrice).toBeCloseTo(0.49, 12);
  });

  it('computes a strict short hedge sell floor after an actual first-leg fill', () => {
    const r = computeRemainingHedgeBudget({ type: 'short', pairShares: 10, leg1NotionalUsd: 6, leg1FeeUsd: 0, secondLegFee: ZERO_FEE, remainingFixedCostsUsd: 0, minimumFinalNetProfitUsd: 1, priceStep: 0.01 });
    expect(r.feasible).toBe(true);
    expect(r.minSellPrice).toBeCloseTo(0.51, 12);
  });

  it('fails closed when the second-leg fee is unknown', () => {
    const r = computeRemainingHedgeBudget({ type: 'long', pairShares: 10, leg1NotionalUsd: 4, leg1FeeUsd: 0, secondLegFee: { status: 'unknown' }, remainingFixedCostsUsd: 0, minimumFinalNetProfitUsd: 0.5 });
    expect(r.feasible).toBe(false);
    expect(r.rejectionReasons).toContain('SECOND_LEG_FEE_UNAVAILABLE');
  });
});
