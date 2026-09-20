import { describe, expect, it } from 'vitest';
import {
  executeExactShareFok,
  getPolymarketMarketOrderAmountUnit,
  mapExactSharesToPolymarketMarketAmount,
  reconcileExactShareFok,
  validateExactShareFokRequest,
  validateFeeQuote,
  type ExactShareFokRequest,
  type ExecutionFill,
  type ExactShareFokAdapter,
  type OrderSubmission,
} from './execution-primitives.js';

const REQ: ExactShareFokRequest = {
  clientOrderId: 'arb-1-yes',
  tokenId: 'YES',
  side: 'BUY',
  shares: 10,
  limitPrice: 0.45,
};

const ACCEPTED: OrderSubmission = {
  clientOrderId: REQ.clientOrderId,
  status: 'ACCEPTED',
  orderId: 'order-1',
};

function fill(overrides: Partial<ExecutionFill> = {}): ExecutionFill {
  return {
    tradeId: 'trade-1',
    orderId: 'order-1',
    tokenId: 'YES',
    side: 'BUY',
    price: 0.44,
    shares: 10,
    feeUsd: 0.01,
    ...overrides,
  };
}

describe('validateExactShareFokRequest', () => {
  it('accepts a valid exact-share FOK request', () => {
    const r = validateExactShareFokRequest(REQ);
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.request.orderType).toBe('FOK');
  });

  it.each([
    ['negative shares', { shares: -1 }],
    ['zero shares', { shares: 0 }],
    ['NaN shares', { shares: Number.NaN }],
    ['price above one', { limitPrice: 1.01 }],
    ['negative price', { limitPrice: -0.01 }],
    ['NaN price', { limitPrice: Number.NaN }],
  ])('fails closed on %s', (_label, patch) => {
    const r = validateExactShareFokRequest({ ...REQ, ...patch });
    expect(r.valid).toBe(false);
  });
});

describe('Polymarket market-order amount semantics', () => {
  it('models BUY amount as USD notional and SELL amount as shares', () => {
    expect(getPolymarketMarketOrderAmountUnit('BUY')).toBe('USD_NOTIONAL');
    expect(getPolymarketMarketOrderAmountUnit('SELL')).toBe('SHARES');
  });

  it('fails closed instead of converting exact-share BUY into USD amount', () => {
    const r = mapExactSharesToPolymarketMarketAmount(REQ);
    expect(r.supported).toBe(false);
    expect(r.amountUnit).toBe('USD_NOTIONAL');
    expect(r.amount).toBeUndefined();
    expect(r.reason).toBe('EXACT_SHARE_BUY_UNSUPPORTED_BY_MARKET_AMOUNT_API');
  });

  it('maps exact-share SELL directly to venue shares', () => {
    const r = mapExactSharesToPolymarketMarketAmount({
      ...REQ,
      clientOrderId: 'sell-map',
      side: 'SELL',
    });
    expect(r).toEqual({
      supported: true,
      amountUnit: 'SHARES',
      amount: 10,
    });
  });
});

describe('reconcileExactShareFok', () => {
  it('does not treat accepted submission as a fill', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, []);
    expect(r.status).toBe('UNKNOWN');
    expect(r.fullyFilled).toBe(false);
    expect(r.safeToContinue).toBe(false);
    expect(r.reconciliationComplete).toBe(false);
    expect(r.reasons).toContain('NO_FILL_EVIDENCE');
  });

  it('accepts an exactly filled FOK with known exact fee', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [fill()]);
    expect(r.status).toBe('FILLED');
    expect(r.filledShares).toBeCloseTo(10, 12);
    expect(r.averagePrice).toBeCloseTo(0.44, 12);
    expect(r.notionalUsd).toBeCloseTo(4.4, 12);
    expect(r.feeUsd).toBeCloseTo(0.01, 12);
    expect(r.safeToContinue).toBe(true);
  });

  it('aggregates multi-fill VWAP for the exact requested shares', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ tradeId: 'a', price: 0.43, shares: 4, feeUsd: 0.004 }),
      fill({ tradeId: 'b', price: 0.45, shares: 6, feeUsd: 0.006 }),
    ]);
    expect(r.status).toBe('FILLED');
    expect(r.averagePrice).toBeCloseTo(0.442, 12);
    expect(r.notionalUsd).toBeCloseTo(4.42, 12);
    expect(r.feeUsd).toBeCloseTo(0.01, 12);
    expect(r.safeToContinue).toBe(true);
  });

  it('deduplicates repeated trade ids', () => {
    const same = fill({ tradeId: 'same', shares: 10 });
    const r = reconcileExactShareFok(REQ, ACCEPTED, [same, same]);
    expect(r.filledShares).toBeCloseTo(10, 12);
    expect(r.tradeIds).toEqual(['same']);
    expect(r.safeToContinue).toBe(true);
  });

  it('treats partial FOK evidence as unsafe protocol violation', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [fill({ shares: 4 })]);
    expect(r.status).toBe('PARTIAL');
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('FOK_PARTIAL_FILL');
  });

  it('treats overfill as unknown and unsafe', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [fill({ shares: 11 })]);
    expect(r.status).toBe('UNKNOWN');
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('FOK_OVERFILL');
  });

  it('fails closed when fill fee is unknown', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ feeUsd: undefined, feeRateBps: undefined }),
    ]);
    expect(r.status).toBe('FILLED');
    expect(r.feeUsd).toBeNull();
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('FILL_FEE_UNKNOWN');
  });

  it('can derive fee from feeRateBps when exact fee is absent', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ feeUsd: undefined, feeRateBps: 100 }),
    ]);
    expect(r.feeUsd).toBeCloseTo(0.044, 12);
    expect(r.safeToContinue).toBe(true);
  });

  it('rejects mismatched token fills instead of counting them', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ tokenId: 'NO' }),
      fill({ tradeId: 'right' }),
    ]);
    expect(r.filledShares).toBeCloseTo(10, 12);
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('FILL_TOKEN_MISMATCH');
  });

  it('rejects mismatched side fills instead of counting them', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ side: 'SELL' }),
      fill({ tradeId: 'right' }),
    ]);
    expect(r.filledShares).toBeCloseTo(10, 12);
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('FILL_SIDE_MISMATCH');
  });

  it('rejects mismatched order ids instead of counting them', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ orderId: 'other-order' }),
      fill({ tradeId: 'right' }),
    ]);
    expect(r.filledShares).toBeCloseTo(10, 12);
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('FILL_ORDER_ID_MISMATCH');
  });

  it('fails closed on malformed fill price', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ price: 1.2 }),
      fill({ tradeId: 'right' }),
    ]);
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('INVALID_FILL_PRICE');
  });

  it('fails closed when a BUY fill exceeds the requested limit price', () => {
    const r = reconcileExactShareFok(REQ, ACCEPTED, [
      fill({ price: 0.46 }),
    ]);
    expect(r.status).toBe('FILLED');
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('BUY_FILL_ABOVE_LIMIT');
  });

  it('fails closed when a SELL fill is below the requested floor price', () => {
    const sellReq: ExactShareFokRequest = {
      ...REQ,
      clientOrderId: 'arb-1-yes-sell',
      side: 'SELL',
      limitPrice: 0.55,
    };
    const sellSubmission: OrderSubmission = {
      clientOrderId: sellReq.clientOrderId,
      status: 'ACCEPTED',
      orderId: 'order-sell',
    };
    const r = reconcileExactShareFok(sellReq, sellSubmission, [
      fill({
        tradeId: 'sell-trade',
        orderId: 'order-sell',
        side: 'SELL',
        price: 0.54,
      }),
    ]);
    expect(r.status).toBe('FILLED');
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('SELL_FILL_BELOW_LIMIT');
  });

  it('returns rejected without pretending there was a fill when no fill evidence exists', () => {
    const r = reconcileExactShareFok(
      REQ,
      { clientOrderId: REQ.clientOrderId, status: 'REJECTED', error: 'venue rejected' },
      []
    );
    expect(r.status).toBe('REJECTED');
    expect(r.filledShares).toBe(0);
    expect(r.safeToContinue).toBe(false);
  });

  it('blocks on submission client id mismatch', () => {
    const r = reconcileExactShareFok(
      REQ,
      { ...ACCEPTED, clientOrderId: 'wrong-client-id' },
      [fill()]
    );
    expect(r.status).toBe('FILLED');
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('SUBMISSION_CLIENT_ORDER_ID_MISMATCH');
  });

  it('treats unknown submission state as unsafe even if no fills are visible', () => {
    const r = reconcileExactShareFok(
      REQ,
      { clientOrderId: REQ.clientOrderId, status: 'UNKNOWN', error: 'timeout' },
      []
    );
    expect(r.status).toBe('UNKNOWN');
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('SUBMISSION_STATE_UNKNOWN');
  });

  it('treats rejected submission with fill evidence as a conflict', () => {
    const r = reconcileExactShareFok(
      REQ,
      { clientOrderId: REQ.clientOrderId, status: 'REJECTED', orderId: 'order-1' },
      [fill()]
    );
    expect(r.safeToContinue).toBe(false);
    expect(r.reasons).toContain('SUBMISSION_FILL_CONFLICT');
  });
});


describe('validateFeeQuote', () => {
  it('accepts known fee quote with conservative worst case', () => {
    expect(validateFeeQuote({
      status: 'known',
      expectedFeeUsd: 0.01,
      worstCaseFeeUsd: 0.02,
    })).toEqual({ valid: true, reasons: [] });
  });

  it('rejects unknown fee quote', () => {
    const r = validateFeeQuote({ status: 'unknown', reason: 'VENUE_FEE_UNAVAILABLE' });
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('VENUE_FEE_UNAVAILABLE');
  });

  it('rejects worst-case fee below expected fee', () => {
    const r = validateFeeQuote({
      status: 'known',
      expectedFeeUsd: 0.02,
      worstCaseFeeUsd: 0.01,
    });
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('WORST_CASE_FEE_BELOW_EXPECTED');
  });
});

describe('executeExactShareFok adapter orchestration', () => {
  it('uses an injected mock adapter and returns a reconciled exact fill', async () => {
    const adapter: ExactShareFokAdapter = {
      submit: async request => ({
        clientOrderId: request.clientOrderId,
        status: 'ACCEPTED',
        orderId: 'order-1',
      }),
      getFills: async () => [fill()],
    };
    const r = await executeExactShareFok(REQ, adapter);
    expect(r.status).toBe('FILLED');
    expect(r.safeToContinue).toBe(true);
  });

  it('preserves exact share quantity for BUY without converting it to USD notional', async () => {
    let submittedShares: number | undefined;
    const adapter: ExactShareFokAdapter = {
      submit: async request => {
        submittedShares = request.shares;
        return {
          clientOrderId: request.clientOrderId,
          status: 'ACCEPTED',
          orderId: 'order-1',
        };
      },
      getFills: async () => [fill()],
    };
    await executeExactShareFok(REQ, adapter);
    expect(submittedShares).toBe(10);
  });

  it('preserves exact share quantity for SELL', async () => {
    const sellReq: ExactShareFokRequest = {
      ...REQ,
      clientOrderId: 'arb-sell',
      side: 'SELL',
      limitPrice: 0.40,
    };
    let submittedShares: number | undefined;
    const adapter: ExactShareFokAdapter = {
      submit: async request => {
        submittedShares = request.shares;
        return {
          clientOrderId: request.clientOrderId,
          status: 'ACCEPTED',
          orderId: 'order-sell',
        };
      },
      getFills: async () => [fill({
        tradeId: 'sell',
        orderId: 'order-sell',
        side: 'SELL',
        price: 0.44,
      })],
    };
    const r = await executeExactShareFok(sellReq, adapter);
    expect(submittedShares).toBe(10);
    expect(r.safeToContinue).toBe(true);
  });

  it('does not call the adapter for an invalid request', async () => {
    let called = false;
    const adapter: ExactShareFokAdapter = {
      submit: async request => {
        called = true;
        return { clientOrderId: request.clientOrderId, status: 'ACCEPTED' };
      },
      getFills: async () => {
        called = true;
        return [];
      },
    };
    const r = await executeExactShareFok({ ...REQ, shares: 0 }, adapter);
    expect(called).toBe(false);
    expect(r.status).toBe('REJECTED');
    expect(r.safeToContinue).toBe(false);
  });

  it('fails closed when submission throws because venue state is unknown', async () => {
    const adapter: ExactShareFokAdapter = {
      submit: async () => { throw new Error('transport timeout'); },
      getFills: async () => [],
    };
    const r = await executeExactShareFok(REQ, adapter);
    expect(r.status).toBe('UNKNOWN');
    expect(r.safeToContinue).toBe(false);
    expect(r.reconciliationComplete).toBe(false);
    expect(r.reasons).toContain('SUBMISSION_STATE_UNKNOWN');
  });

  it('fails closed when fill reconciliation throws', async () => {
    const adapter: ExactShareFokAdapter = {
      submit: async request => ({
        clientOrderId: request.clientOrderId,
        status: 'ACCEPTED',
        orderId: 'order-1',
      }),
      getFills: async () => { throw new Error('trade endpoint unavailable'); },
    };
    const r = await executeExactShareFok(REQ, adapter);
    expect(r.status).toBe('UNKNOWN');
    expect(r.safeToContinue).toBe(false);
    expect(r.reconciliationComplete).toBe(false);
    expect(r.reasons).toContain('FILL_RECONCILIATION_FAILED');
  });
});
