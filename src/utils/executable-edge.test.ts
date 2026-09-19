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
    costs: {
      expectedGasUsd: 0,
      worstCaseGasUsd: 0,
    },
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
    ...baseLongInput({
      type: 'short',
      yesBook: {
        bids: [{ price: 0.55, size: 100 }],
        asks: [{ price: 0.56, size: 100 }],
        timestampMs: nowMs - 100,
      },
      noBook: {
        bids: [{ price: 0.55, size: 100 }],
        asks: [{ price: 0.56, size: 100 }],
        timestampMs: nowMs - 120,
      },
      nowMs,
    }),
    ...overrides,
  };
}

describe('simulateExactShareFill', () => {
  it('fills a single level exactly', () => {
    const result = simulateExactShareFill([{ price: 0.4, size: 10 }], 5, 'BUY');
    expect(result.fullyFilled).toBe(true);
    expect(result.filledShares).toBeCloseTo(5, 12);
    expect(result.vwap).toBeCloseTo(0.4, 12);
    expect(result.notionalUsd).toBeCloseTo(2, 12);
    expect(result.worstPrice).toBeCloseTo(0.4, 12);
  });

  it('calculates multi-level VWAP using exact shares', () => {
    const result = simulateExactShareFill([
      { price: 0.4, size: 2 },
      { price: 0.5, size: 3 },
    ], 5, 'BUY');
    expect(result.fullyFilled).toBe(true);
    expect(result.vwap).toBeCloseTo(0.46, 12);
    expect(result.notionalUsd).toBeCloseTo(2.3, 12);
    expect(result.levelsConsumed).toHaveLength(2);
  });

  it('fails closed on insufficient depth', () => {
    const result = simulateExactShareFill([{ price: 0.4, size: 4 }], 5, 'BUY');
    expect(result.fullyFilled).toBe(false);
    expect(result.filledShares).toBeCloseTo(4, 12);
  });

  it('enforces a BUY cap', () => {
    const result = simulateExactShareFill([
      { price: 0.4, size: 2 },
      { price: 0.5, size: 3 },
    ], 5, 'BUY', 0.45);
    expect(result.fullyFilled).toBe(false);
    expect(result.filledShares).toBeCloseTo(2, 12);
    expect(result.priceConstrained).toBe(true);
  });

  it('enforces a SELL floor', () => {
    const result = simulateExactShareFill([
      { price: 0.6, size: 2 },
      { price: 0.5, size: 3 },
    ], 5, 'SELL', 0.55);
    expect(result.fullyFilled).toBe(false);
    expect(result.filledShares).toBeCloseTo(2, 12);
    expect(result.priceConstrained).toBe(true);
  });

  it('fails closed instead of filtering an invalid book price and continuing', () => {
    const result = simulateExactShareFill([
      { price: 1.01, size: 1 },
      { price: 0.4, size: 10 },
    ], 5, 'BUY');
    expect(result.bookPricesValid).toBe(false);
    expect(result.invalidPriceLevels).toBe(1);
    expect(result.fullyFilled).toBe(false);
    expect(result.filledShares).toBe(0);
    expect(result.levelsConsumed).toEqual([]);
  });

  it('calculates multi-level SELL VWAP', () => {
    const result = simulateExactShareFill([
      { price: 0.6, size: 2 },
      { price: 0.5, size: 3 },
    ], 5, 'SELL');
    expect(result.fullyFilled).toBe(true);
    expect(result.vwap).toBeCloseTo(0.54, 12);
    expect(result.notionalUsd).toBeCloseTo(2.7, 12);
    expect(result.levelsConsumed).toHaveLength(2);
  });
});

describe('validateBookFreshness', () => {
  const nowMs = 1_700_000_000_000;

  it('rejects a stale YES book', () => {
    const result = validateBookFreshness({
      nowMs,
      yesTimestampMs: nowMs - 2_000,
      noTimestampMs: nowMs - 100,
      maxBookAgeMs: 1_000,
      maxBookSkewMs: 5_000,
    });
    expect(result.fresh).toBe(false);
    expect(result.reasons).toContain('YES_BOOK_STALE');
  });

  it('rejects a stale NO book', () => {
    const result = validateBookFreshness({
      nowMs,
      yesTimestampMs: nowMs - 100,
      noTimestampMs: nowMs - 2_000,
      maxBookAgeMs: 1_000,
      maxBookSkewMs: 5_000,
    });
    expect(result.fresh).toBe(false);
    expect(result.reasons).toContain('NO_BOOK_STALE');
  });

  it('rejects excessive YES/NO timestamp skew', () => {
    const result = validateBookFreshness({
      nowMs,
      yesTimestampMs: nowMs - 100,
      noTimestampMs: nowMs - 800,
      maxBookAgeMs: 1_000,
      maxBookSkewMs: 500,
    });
    expect(result.fresh).toBe(false);
    expect(result.reasons).toContain('BOOK_TIMESTAMP_SKEW');
  });
});

describe('calculateExecutableQuote', () => {
  it('targets exactly equal YES/NO pair shares', () => {
    const quote = calculateExecutableQuote(baseLongInput({ targetPairShares: 7 }));
    expect(quote.yesLeg.targetShares).toBeCloseTo(7, 12);
    expect(quote.noLeg.targetShares).toBeCloseTo(7, 12);
    expect(quote.yesLeg.fullyFillable).toBe(true);
    expect(quote.noLeg.fullyFillable).toBe(true);
    expect(quote.safeToExecute).toBe(true);
  });

  it('can have positive expected profit but negative worst-case profit', () => {
    const quote = calculateExecutableQuote(baseLongInput({
      maxAdverseSlippageBps: 1_500,
    }));
    expect(quote.expectedNetProfitUsd).toBeGreaterThan(0);
    expect(quote.worstCaseNetProfitUsd).toBeLessThan(0);
    expect(quote.safeToExecute).toBe(false);
    expect(quote.rejectionReasons).toContain('WORST_CASE_NET_PROFIT_BELOW_THRESHOLD');
  });

  it('applies a dynamic non-zero price-curve fee', () => {
    const dynamicFee: FeeModel = {
      status: 'known',
      kind: 'price_curve_bps',
      baseRateBps: 100,
      points: [
        { price: 0, multiplier: 0.5 },
        { price: 0.5, multiplier: 1 },
        { price: 1, multiplier: 0.5 },
      ],
    };
    const quote = calculateExecutableQuote(baseLongInput({
      yesFee: dynamicFee,
      noFee: dynamicFee,
    }));
    expect(quote.expectedFeesUsd ?? 0).toBeGreaterThan(0);
    expect(quote.expectedNetProfitUsd).toBeLessThan(quote.expectedGrossProfitUsd);
    expect(quote.safeToExecute).toBe(true);
  });

  it('fails closed when fee data is unavailable instead of treating it as zero', () => {
    const quote = calculateExecutableQuote(baseLongInput({
      yesFee: { status: 'unknown', reason: 'VENUE_FEE_UNAVAILABLE' },
    }));
    expect(quote.safeToExecute).toBe(false);
    expect(quote.expectedFeesUsd).toBeNull();
    expect(quote.rejectionReasons).toContain('YES_VENUE_FEE_UNAVAILABLE');
  });

  it('rejects when gas eats the edge', () => {
    const input = baseLongInput({
      yesBook: {
        bids: [{ price: 0.48, size: 100 }],
        asks: [{ price: 0.49, size: 100 }],
        timestampMs: 1_699_999_999_900,
      },
      noBook: {
        bids: [{ price: 0.48, size: 100 }],
        asks: [{ price: 0.49, size: 100 }],
        timestampMs: 1_699_999_999_900,
      },
      costs: { expectedGasUsd: 0.25, worstCaseGasUsd: 0.25 },
    });
    const quote = calculateExecutableQuote(input);
    expect(quote.expectedGrossProfitUsd).toBeCloseTo(0.2, 12);
    expect(quote.expectedNetProfitUsd).toBeLessThan(0);
    expect(quote.safeToExecute).toBe(false);
  });

  it('regression: rejects when top level is profitable but full depth VWAP is not', () => {
    const nowMs = 1_700_000_000_000;
    const flatFee: FeeModel = { status: 'known', kind: 'flat_bps', rateBps: 10 };
    const quote = calculateExecutableQuote(baseLongInput({
      nowMs,
      targetPairShares: 10,
      yesBook: {
        bids: [{ price: 0.44, size: 10 }],
        asks: [
          { price: 0.45, size: 1 },
          { price: 0.55, size: 9 },
        ],
        timestampMs: nowMs - 50,
      },
      noBook: {
        bids: [{ price: 0.44, size: 10 }],
        asks: [
          { price: 0.45, size: 1 },
          { price: 0.55, size: 9 },
        ],
        timestampMs: nowMs - 60,
      },
      yesFee: flatFee,
      noFee: flatFee,
      costs: { expectedGasUsd: 0.05, worstCaseGasUsd: 0.05 },
      maxAdverseSlippageBps: 100,
    }));

    expect(quote.yesLeg.expectedVwap).toBeCloseTo(0.54, 12);
    expect(quote.noLeg.expectedVwap).toBeCloseTo(0.54, 12);
    expect(quote.expectedNetProfitUsd).toBeLessThan(0);
    expect(quote.worstCaseNetProfitUsd).toBeLessThan(0);
    expect(quote.safeToExecute).toBe(false);
  });

  it('finds the largest pair size that survives the complete worst-case gate', () => {
    const nowMs = 1_700_000_000_000;
    const result = findSafePairSize({
      ...baseLongInput({
        nowMs,
        yesBook: {
          bids: [{ price: 0.44, size: 10 }],
          asks: [
            { price: 0.45, size: 5 },
            { price: 0.58, size: 5 },
          ],
          timestampMs: nowMs - 50,
        },
        noBook: {
          bids: [{ price: 0.44, size: 10 }],
          asks: [
            { price: 0.45, size: 5 },
            { price: 0.58, size: 5 },
          ],
          timestampMs: nowMs - 50,
        },
      }),
      maxPairShares: 10,
      minPairShares: 1,
      sizeStepShares: 1,
    });
    expect(result).not.toBeNull();
    expect(result?.targetPairShares).toBe(5);
    expect(result?.safeToExecute).toBe(true);
  });

  it('uses strict threshold boundaries', () => {
    const atBoundary = calculateExecutableQuote(baseLongInput({
      thresholds: {
        minExpectedNetProfitUsd: 1,
        minWorstCaseNetProfitUsd: 1,
        minExpectedNetEdgeBps: 0,
        minWorstCaseNetEdgeBps: 0,
      },
    }));
    expect(atBoundary.expectedNetProfitUsd).toBeCloseTo(1, 12);
    expect(atBoundary.safeToExecute).toBe(false);

    const belowBoundary = calculateExecutableQuote(baseLongInput({
      thresholds: {
        minExpectedNetProfitUsd: 0.99,
        minWorstCaseNetProfitUsd: 0.99,
        minExpectedNetEdgeBps: 0,
        minWorstCaseNetEdgeBps: 0,
      },
    }));
    expect(belowBoundary.safeToExecute).toBe(true);
  });

  it('does not promote microscopic floating-point edge to a safe trade', () => {
    const nowMs = 1_700_000_000_000;
    const quote = calculateExecutableQuote(baseLongInput({
      targetPairShares: 1,
      yesBook: {
        bids: [{ price: 0.49, size: 1 }],
        asks: [{ price: 0.5, size: 1 }],
        timestampMs: nowMs - 10,
      },
      noBook: {
        bids: [{ price: 0.49, size: 1 }],
        asks: [{ price: 0.4999999995, size: 1 }],
        timestampMs: nowMs - 10,
      },
    }));
    expect(quote.expectedNetProfitUsd).toBeGreaterThan(0);
    expect(quote.expectedNetProfitUsd).toBeLessThan(1e-9);
    expect(quote.safeToExecute).toBe(false);
  });
});

describe('Executable quote hardening', () => {
  it('rejects price > 1, negative, NaN, and Infinity book prices', () => {
    for (const badPrice of [1.01, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const base = baseLongInput();
      const quote = calculateExecutableQuote({
        ...base,
        yesBook: {
          ...base.yesBook,
          asks: [{ price: badPrice, size: 1 }, ...base.yesBook.asks],
        },
      });
      expect(quote.safeToExecute).toBe(false);
      expect(quote.rejectionReasons).toContain('INVALID_YES_BOOK_PRICE');
    }
  });

  it('rejects malformed NO book data with an explicit reason', () => {
    const base = baseLongInput();
    const quote = calculateExecutableQuote({
      ...base,
      noBook: {
        ...base.noBook,
        bids: [{ price: 1.2, size: 1 }, ...base.noBook.bids],
      },
    });
    expect(quote.safeToExecute).toBe(false);
    expect(quote.rejectionReasons).toContain('INVALID_NO_BOOK_PRICE');
  });

  it('rejects worst-case gas below expected gas', () => {
    const quote = calculateExecutableQuote(baseLongInput({
      costs: { expectedGasUsd: 0.2, worstCaseGasUsd: 0.1 },
    }));
    expect(quote.safeToExecute).toBe(false);
    expect(quote.rejectionReasons).toContain('WORST_CASE_GAS_BELOW_EXPECTED');
  });

  it('rejects worst-case other costs below expected other costs', () => {
    const quote = calculateExecutableQuote(baseLongInput({
      costs: {
        expectedGasUsd: 0,
        worstCaseGasUsd: 0,
        expectedOtherCostsUsd: 0.2,
        worstCaseOtherCostsUsd: 0.1,
      },
    }));
    expect(quote.safeToExecute).toBe(false);
    expect(quote.rejectionReasons).toContain('WORST_CASE_OTHER_COSTS_BELOW_EXPECTED');
  });
});

describe('Short executable quotes', () => {
  it('produces a profitable short quote', () => {
    const quote = calculateExecutableQuote(baseShortInput());
    expect(quote.expectedGrossProfitUsd).toBeCloseTo(1, 12);
    expect(quote.expectedNetProfitUsd).toBeCloseTo(1, 12);
    expect(quote.worstCaseNetProfitUsd).toBeCloseTo(1, 12);
    expect(quote.safeToExecute).toBe(true);
  });

  it('rejects when the short worst-case floor destroys the edge', () => {
    const quote = calculateExecutableQuote(baseShortInput({ maxAdverseSlippageBps: 1_000 }));
    expect(quote.expectedNetProfitUsd).toBeGreaterThan(0);
    expect(quote.worstCaseNetProfitUsd).toBeLessThan(0);
    expect(quote.safeToExecute).toBe(false);
    expect(quote.rejectionReasons).toContain('WORST_CASE_NET_PROFIT_BELOW_THRESHOLD');
  });

  it('rejects when short fees eat the edge', () => {
    const nowMs = 1_700_000_000_000;
    const fee: FeeModel = { status: 'known', kind: 'flat_bps', rateBps: 100 };
    const quote = calculateExecutableQuote(baseShortInput({
      yesBook: {
        bids: [{ price: 0.505, size: 100 }],
        asks: [{ price: 0.515, size: 100 }],
        timestampMs: nowMs - 100,
      },
      noBook: {
        bids: [{ price: 0.505, size: 100 }],
        asks: [{ price: 0.515, size: 100 }],
        timestampMs: nowMs - 120,
      },
      yesFee: fee,
      noFee: fee,
    }));
    expect(quote.expectedGrossProfitUsd).toBeGreaterThan(0);
    expect(quote.expectedNetProfitUsd).toBeLessThan(0);
    expect(quote.safeToExecute).toBe(false);
  });

  it('rejects short quote with insufficient bid depth', () => {
    const base = baseShortInput();
    const quote = calculateExecutableQuote({
      ...base,
      yesBook: { ...base.yesBook, bids: [{ price: 0.55, size: 5 }] },
      targetPairShares: 10,
    });
    expect(quote.safeToExecute).toBe(false);
    expect(quote.rejectionReasons).toContain('INSUFFICIENT_YES_DEPTH');
  });

  it('targets exact equal YES/NO pair shares for short', () => {
    const quote = calculateExecutableQuote(baseShortInput({ targetPairShares: 7 }));
    expect(quote.yesLeg.side).toBe('SELL');
    expect(quote.noLeg.side).toBe('SELL');
    expect(quote.yesLeg.targetShares).toBeCloseTo(7, 12);
    expect(quote.noLeg.targetShares).toBeCloseTo(7, 12);
    expect(quote.yesLeg.fullyFillable).toBe(true);
    expect(quote.noLeg.fullyFillable).toBe(true);
    expect(quote.safeToExecute).toBe(true);
  });
});

describe('computeRemainingHedgeBudget', () => {
  it('computes a strict long hedge buy budget after an actual first-leg fill', () => {
    const result = computeRemainingHedgeBudget({
      type: 'long',
      pairShares: 10,
      leg1NotionalUsd: 4,
      leg1FeeUsd: 0,
      secondLegFee: ZERO_FEE,
      remainingFixedCostsUsd: 0,
      minimumFinalNetProfitUsd: 1,
      priceStep: 0.01,
    });
    expect(result.feasible).toBe(true);
    expect(result.maxBuyPrice).toBeCloseTo(0.49, 12);
  });

  it('computes a strict short hedge sell floor after an actual first-leg fill', () => {
    const result = computeRemainingHedgeBudget({
      type: 'short',
      pairShares: 10,
      leg1NotionalUsd: 6,
      leg1FeeUsd: 0,
      secondLegFee: ZERO_FEE,
      remainingFixedCostsUsd: 0,
      minimumFinalNetProfitUsd: 1,
      priceStep: 0.01,
    });
    expect(result.feasible).toBe(true);
    expect(result.minSellPrice).toBeCloseTo(0.51, 12);
  });

  it('fails closed when the second-leg fee is unknown', () => {
    const result = computeRemainingHedgeBudget({
      type: 'long',
      pairShares: 10,
      leg1NotionalUsd: 4,
      leg1FeeUsd: 0,
      secondLegFee: { status: 'unknown' },
      remainingFixedCostsUsd: 0,
      minimumFinalNetProfitUsd: 0.5,
    });
    expect(result.feasible).toBe(false);
    expect(result.rejectionReasons).toContain('SECOND_LEG_FEE_UNAVAILABLE');
  });
});
