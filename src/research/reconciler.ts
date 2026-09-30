/**
 * Phase 5.1 ledger reconciliation.
 *
 * Compares replayed closing balances against independently observed closing
 * balances. Tolerances are caller-supplied policy inputs and must be declared
 * before reviewing residuals; this module never relaxes them automatically.
 */
import {
  replayTokenLedger,
  type TokenBalance,
} from './token-ledger.js';
import {
  replayCashLedger,
  type CashBalance,
} from './cash-ledger.js';
import { type NormalizedEventV1 } from './normalized-event.js';

export const RECONCILER_SCHEMA_VERSION = 'reconciler-v1' as const;

export interface ReconciliationTolerance {
  tokenAbsolute: number;
  cashAbsoluteByCurrency: Record<string, number>;
}

export interface ReconciliationInput {
  openingTokenBalances?: TokenBalance[];
  openingCashBalances?: CashBalance[];
  events: NormalizedEventV1[];
  observedClosingTokenBalances: TokenBalance[];
  observedClosingCashBalances: CashBalance[];
  tolerance: ReconciliationTolerance;
}

export interface Residual {
  identity: string;
  expected: number;
  observed: number;
  residual: number;
  tolerance: number;
  withinTolerance: boolean;
}

export interface ReconciliationResult {
  schemaVersion: typeof RECONCILER_SCHEMA_VERSION;
  valid: boolean;
  reconciled: boolean;
  reasons: string[];
  tokenResiduals: Residual[];
  cashResiduals: Residual[];
}

const tokenKey = (b: Pick<TokenBalance, 'assetId' | 'unit'>): string =>
  `${b.unit}:${b.assetId}`;

const asMap = <T>(
  values: T[],
  key: (value: T) => string,
  amount: (value: T) => number,
): Map<string, number> => {
  const map = new Map<string, number>();
  for (const value of values) {
    const k = key(value);
    map.set(k, (map.get(k) ?? 0) + amount(value));
  }
  return map;
};

const allKeys = (a: Map<string, number>, b: Map<string, number>): string[] =>
  [...new Set([...a.keys(), ...b.keys()])].sort();

export function reconcileLedgers(
  input: ReconciliationInput,
): ReconciliationResult {
  const reasons: string[] = [];

  if (
    !Number.isFinite(input.tolerance.tokenAbsolute) ||
    input.tolerance.tokenAbsolute < 0
  ) {
    reasons.push('INVALID_TOKEN_TOLERANCE');
  }

  for (const [currency, tolerance] of Object.entries(
    input.tolerance.cashAbsoluteByCurrency,
  )) {
    if (!currency.trim() || !Number.isFinite(tolerance) || tolerance < 0) {
      reasons.push('INVALID_CASH_TOLERANCE');
    }
  }

  const tokenReplay = replayTokenLedger({
    openingBalances: input.openingTokenBalances,
    events: input.events,
  });
  const cashReplay = replayCashLedger({
    openingBalances: input.openingCashBalances,
    events: input.events,
  });

  if (!tokenReplay.valid) reasons.push('TOKEN_LEDGER_INVALID');
  if (!cashReplay.valid) reasons.push('CASH_LEDGER_INVALID');

  const expectedTokens = asMap(
    tokenReplay.closingBalances,
    tokenKey,
    (b) => b.amount,
  );
  const observedTokens = asMap(
    input.observedClosingTokenBalances,
    tokenKey,
    (b) => b.amount,
  );

  const tokenResiduals: Residual[] = allKeys(
    expectedTokens,
    observedTokens,
  ).map((identity) => {
    const expected = expectedTokens.get(identity) ?? 0;
    const observed = observedTokens.get(identity) ?? 0;
    const residual = observed - expected;
    const tolerance = input.tolerance.tokenAbsolute;
    return {
      identity,
      expected,
      observed,
      residual,
      tolerance,
      withinTolerance: Math.abs(residual) <= tolerance,
    };
  });

  const expectedCash = asMap(
    cashReplay.closingBalances,
    (b) => b.currency,
    (b) => b.amount,
  );
  const observedCash = asMap(
    input.observedClosingCashBalances,
    (b) => b.currency,
    (b) => b.amount,
  );

  const cashResiduals: Residual[] = allKeys(expectedCash, observedCash).map(
    (currency) => {
      const expected = expectedCash.get(currency) ?? 0;
      const observed = observedCash.get(currency) ?? 0;
      const residual = observed - expected;
      const tolerance =
        input.tolerance.cashAbsoluteByCurrency[currency] ?? 0;
      return {
        identity: currency,
        expected,
        observed,
        residual,
        tolerance,
        withinTolerance: Math.abs(residual) <= tolerance,
      };
    },
  );

  const reconciled =
    reasons.length === 0 &&
    tokenResiduals.every((r) => r.withinTolerance) &&
    cashResiduals.every((r) => r.withinTolerance);

  if (!tokenResiduals.every((r) => r.withinTolerance)) {
    reasons.push('TOKEN_RESIDUAL_EXCEEDS_TOLERANCE');
  }
  if (!cashResiduals.every((r) => r.withinTolerance)) {
    reasons.push('CASH_RESIDUAL_EXCEEDS_TOLERANCE');
  }

  return {
    schemaVersion: RECONCILER_SCHEMA_VERSION,
    valid:
      !reasons.includes('INVALID_TOKEN_TOLERANCE') &&
      !reasons.includes('INVALID_CASH_TOLERANCE') &&
      !reasons.includes('TOKEN_LEDGER_INVALID') &&
      !reasons.includes('CASH_LEDGER_INVALID'),
    reconciled,
    reasons: [...new Set(reasons)],
    tokenResiduals,
    cashResiduals,
  };
}
