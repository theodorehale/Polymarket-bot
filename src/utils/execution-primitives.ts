/**
 * Execution primitives for exact-share FOK arbitration.
 *
 * Phase 3.3 scope:
 * - pure request validation
 * - submission/fill reconciliation
 * - fee quote contract
 * - NO wallet, network, private key, or real order placement
 */

export type ExecutionSide = 'BUY' | 'SELL';

export interface ExactShareFokRequest {
  clientOrderId: string;
  tokenId: string;
  side: ExecutionSide;
  shares: number;
  limitPrice: number;
}

export interface ValidatedExactShareFokRequest extends ExactShareFokRequest {
  orderType: 'FOK';
}

export interface OrderSubmission {
  clientOrderId: string;
  accepted: boolean;
  orderId?: string;
  error?: string;
}

export interface ExecutionFill {
  tradeId: string;
  orderId?: string;
  tokenId: string;
  side: ExecutionSide;
  price: number;
  shares: number;
  /** Exact fee in USD when known. */
  feeUsd?: number;
  /** Fallback fee rate when exact feeUsd is unavailable. */
  feeRateBps?: number;
}

export type FillReceiptStatus =
  | 'FILLED'
  | 'UNFILLED'
  | 'PARTIAL'
  | 'UNKNOWN'
  | 'REJECTED';

export interface FillReceipt {
  clientOrderId: string;
  orderId?: string;
  tokenId: string;
  side: ExecutionSide;
  requestedShares: number;
  filledShares: number;
  averagePrice: number | null;
  notionalUsd: number;
  feeUsd: number | null;
  status: FillReceiptStatus;
  fullyFilled: boolean;
  reconciliationComplete: boolean;
  safeToContinue: boolean;
  reasons: string[];
  tradeIds: string[];
}

export interface ExecutionFeeQuote {
  status: 'known' | 'unknown';
  expectedFeeUsd?: number;
  worstCaseFeeUsd?: number;
  source?: string;
  reason?: string;
}

export interface ExecutionFeeQuoteRequest {
  tokenId: string;
  side: ExecutionSide;
  shares: number;
  price: number;
}

export type ExecutionFeeQuoteProvider = (
  request: ExecutionFeeQuoteRequest
) => ExecutionFeeQuote | Promise<ExecutionFeeQuote>;

const EPS = 1e-9;

function validFinitePositive(x: number): boolean {
  return Number.isFinite(x) && x > 0;
}

function validPrice(x: number): boolean {
  return Number.isFinite(x) && x >= 0 && x <= 1;
}

export function validateExactShareFokRequest(
  request: ExactShareFokRequest
): { valid: true; request: ValidatedExactShareFokRequest } | { valid: false; reasons: string[] } {
  const reasons: string[] = [];

  if (!request.clientOrderId?.trim()) reasons.push('INVALID_CLIENT_ORDER_ID');
  if (!request.tokenId?.trim()) reasons.push('INVALID_TOKEN_ID');
  if (request.side !== 'BUY' && request.side !== 'SELL') reasons.push('INVALID_SIDE');
  if (!validFinitePositive(request.shares)) reasons.push('INVALID_SHARE_QUANTITY');
  if (!validPrice(request.limitPrice)) reasons.push('INVALID_LIMIT_PRICE');

  if (reasons.length > 0) return { valid: false, reasons };

  return {
    valid: true,
    request: {
      ...request,
      orderType: 'FOK',
    },
  };
}

function feeForFill(fill: ExecutionFill): number | null {
  if (fill.feeUsd !== undefined) {
    return Number.isFinite(fill.feeUsd) && fill.feeUsd >= 0 ? fill.feeUsd : null;
  }
  if (fill.feeRateBps !== undefined) {
    if (!(Number.isFinite(fill.feeRateBps) && fill.feeRateBps >= 0)) return null;
    return fill.price * fill.shares * fill.feeRateBps / 10_000;
  }
  return null;
}

/**
 * Reconcile venue fills against one exact-share FOK request.
 *
 * Important: an accepted submission is NOT treated as a fill. The receipt is
 * safe to continue only when the requested quantity is reconciled exactly.
 */
export function reconcileExactShareFok(
  request: ExactShareFokRequest,
  submission: OrderSubmission,
  fills: ExecutionFill[]
): FillReceipt {
  const validation = validateExactShareFokRequest(request);
  const reasons: string[] = [];

  if (!validation.valid) {
    return {
      clientOrderId: request.clientOrderId,
      orderId: submission.orderId,
      tokenId: request.tokenId,
      side: request.side,
      requestedShares: Number.isFinite(request.shares) ? request.shares : 0,
      filledShares: 0,
      averagePrice: null,
      notionalUsd: 0,
      feeUsd: null,
      status: 'REJECTED',
      fullyFilled: false,
      reconciliationComplete: true,
      safeToContinue: false,
      reasons: validation.reasons,
      tradeIds: [],
    };
  }

  if (submission.clientOrderId !== request.clientOrderId) {
    reasons.push('SUBMISSION_CLIENT_ORDER_ID_MISMATCH');
  }

  if (!submission.accepted) {
    if (submission.error) reasons.push('ORDER_REJECTED:' + submission.error);
    else reasons.push('ORDER_REJECTED');

    return {
      clientOrderId: request.clientOrderId,
      orderId: submission.orderId,
      tokenId: request.tokenId,
      side: request.side,
      requestedShares: request.shares,
      filledShares: 0,
      averagePrice: null,
      notionalUsd: 0,
      feeUsd: 0,
      status: 'REJECTED',
      fullyFilled: false,
      reconciliationComplete: true,
      safeToContinue: false,
      reasons,
      tradeIds: [],
    };
  }

  const dedup = new Map<string, ExecutionFill>();
  for (const fill of fills) {
    if (!fill.tradeId?.trim()) {
      reasons.push('INVALID_TRADE_ID');
      continue;
    }
    if (dedup.has(fill.tradeId)) continue;
    dedup.set(fill.tradeId, fill);
  }

  let filledShares = 0;
  let notionalUsd = 0;
  let totalFeeUsd = 0;
  let feeKnown = true;
  const tradeIds: string[] = [];

  for (const fill of dedup.values()) {
    if (fill.tokenId !== request.tokenId) {
      reasons.push('FILL_TOKEN_MISMATCH');
      continue;
    }
    if (fill.side !== request.side) {
      reasons.push('FILL_SIDE_MISMATCH');
      continue;
    }
    if (submission.orderId && fill.orderId && fill.orderId !== submission.orderId) {
      reasons.push('FILL_ORDER_ID_MISMATCH');
      continue;
    }
    if (!validPrice(fill.price)) {
      reasons.push('INVALID_FILL_PRICE');
      continue;
    }
    if (!validFinitePositive(fill.shares)) {
      reasons.push('INVALID_FILL_SHARES');
      continue;
    }

    filledShares += fill.shares;
    notionalUsd += fill.price * fill.shares;
    tradeIds.push(fill.tradeId);

    const fee = feeForFill(fill);
    if (fee === null) feeKnown = false;
    else totalFeeUsd += fee;
  }

  const averagePrice = filledShares > EPS ? notionalUsd / filledShares : null;
  const fullyFilled = Math.abs(filledShares - request.shares) <= EPS;
  const overfilled = filledShares > request.shares + EPS;
  const partial = filledShares > EPS && filledShares < request.shares - EPS;

  if (overfilled) reasons.push('FOK_OVERFILL');
  if (partial) reasons.push('FOK_PARTIAL_FILL');
  if (!feeKnown && filledShares > EPS) reasons.push('FILL_FEE_UNKNOWN');

  let status: FillReceiptStatus;
  let reconciliationComplete = true;

  if (overfilled) {
    status = 'UNKNOWN';
  } else if (fullyFilled) {
    status = 'FILLED';
  } else if (partial) {
    status = 'PARTIAL';
  } else if (filledShares <= EPS) {
    // Accepted submission with no matching fill evidence is not proof that the
    // FOK order failed. Treat execution state as unknown until the venue says so.
    status = 'UNKNOWN';
    reconciliationComplete = false;
    reasons.push('NO_FILL_EVIDENCE');
  } else {
    status = 'UNKNOWN';
    reconciliationComplete = false;
  }

  const safeToContinue =
    fullyFilled &&
    !overfilled &&
    feeKnown &&
    reasons.length === 0 &&
    submission.clientOrderId === request.clientOrderId;

  return {
    clientOrderId: request.clientOrderId,
    orderId: submission.orderId,
    tokenId: request.tokenId,
    side: request.side,
    requestedShares: request.shares,
    filledShares,
    averagePrice,
    notionalUsd,
    feeUsd: feeKnown ? totalFeeUsd : null,
    status,
    fullyFilled,
    reconciliationComplete,
    safeToContinue,
    reasons: [...new Set(reasons)],
    tradeIds,
  };
}

export function validateFeeQuote(
  quote: ExecutionFeeQuote
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (quote.status === 'unknown') {
    reasons.push(quote.reason || 'FEE_QUOTE_UNKNOWN');
    return { valid: false, reasons };
  }

  if (!(Number.isFinite(quote.expectedFeeUsd) && quote.expectedFeeUsd! >= 0)) {
    reasons.push('INVALID_EXPECTED_FEE');
  }
  if (!(Number.isFinite(quote.worstCaseFeeUsd) && quote.worstCaseFeeUsd! >= 0)) {
    reasons.push('INVALID_WORST_CASE_FEE');
  }
  if (
    Number.isFinite(quote.expectedFeeUsd) &&
    Number.isFinite(quote.worstCaseFeeUsd) &&
    quote.worstCaseFeeUsd! + EPS < quote.expectedFeeUsd!
  ) {
    reasons.push('WORST_CASE_FEE_BELOW_EXPECTED');
  }

  return { valid: reasons.length === 0, reasons };
}
