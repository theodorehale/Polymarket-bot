/**
 * Phase 5.1 deterministic cash ledger replay.
 *
 * Scientific/accounting rules:
 * - Deposit / withdrawal are cash movements, not PnL.
 * - Cash deltas are replayed exactly as normalized events declare them.
 * - This is accounting infrastructure, not a strategy or PnL engine.
 */
import {
  type NormalizedEventV1,
  validateNormalizedEvent,
} from './normalized-event.js';

export const CASH_LEDGER_SCHEMA_VERSION = 'cash-ledger-v1' as const;

export interface CashBalance {
  currency: string;
  amount: number;
}

export interface CashLedgerReplayInput {
  openingBalances?: CashBalance[];
  events: NormalizedEventV1[];
}

export interface CashLedgerReplayResult {
  schemaVersion: typeof CASH_LEDGER_SCHEMA_VERSION;
  valid: boolean;
  reasons: string[];
  appliedEventIds: string[];
  closingBalances: CashBalance[];
}

export interface CashFlowBreakdown {
  deposits: Record<string, number>;
  withdrawals: Record<string, number>;
  fees: Record<string, number>;
  incentives: Record<string, number>;
  tradeAndProtocol: Record<string, number>;
  other: Record<string, number>;
}

export interface CashLedgerDetailedResult extends CashLedgerReplayResult {
  flows: CashFlowBreakdown;
}

const add = (target: Record<string, number>, currency: string, amount: number) => {
  target[currency] = (target[currency] ?? 0) + amount;
};

export function replayCashLedger(
  input: CashLedgerReplayInput,
): CashLedgerDetailedResult {
  const reasons: string[] = [];
  const balances = new Map<string, number>();
  const applied = new Set<string>();

  const flows: CashFlowBreakdown = {
    deposits: {},
    withdrawals: {},
    fees: {},
    incentives: {},
    tradeAndProtocol: {},
    other: {},
  };

  for (const opening of input.openingBalances ?? []) {
    if (!opening.currency.trim()) {
      reasons.push('OPENING_CASH_MISSING_CURRENCY');
      continue;
    }
    if (!Number.isFinite(opening.amount)) {
      reasons.push('OPENING_CASH_INVALID_AMOUNT');
      continue;
    }
    if (balances.has(opening.currency)) {
      reasons.push('DUPLICATE_OPENING_CASH_BALANCE');
    }
    balances.set(
      opening.currency,
      (balances.get(opening.currency) ?? 0) + opening.amount,
    );
  }

  for (const event of input.events) {
    const validation = validateNormalizedEvent(event);
    if (!validation.valid) {
      reasons.push('INVALID_NORMALIZED_EVENT');
      continue;
    }

    if (applied.has(event.normalizedEventId)) {
      reasons.push('DUPLICATE_NORMALIZED_EVENT_ID');
      continue;
    }
    applied.add(event.normalizedEventId);

    for (const delta of event.cashDeltas) {
      const next = (balances.get(delta.currency) ?? 0) + delta.amount;
      if (!Number.isFinite(next)) {
        reasons.push('NON_FINITE_CASH_BALANCE');
        continue;
      }
      balances.set(delta.currency, next);

      switch (event.eventType) {
        case 'DEPOSIT':
          add(flows.deposits, delta.currency, delta.amount);
          break;
        case 'WITHDRAWAL':
          add(flows.withdrawals, delta.currency, delta.amount);
          break;
        case 'FEE':
          add(flows.fees, delta.currency, delta.amount);
          break;
        case 'REWARD':
        case 'REBATE':
        case 'YIELD':
          add(flows.incentives, delta.currency, delta.amount);
          break;
        case 'TRADE':
        case 'SPLIT':
        case 'MERGE':
        case 'REDEEM':
        case 'CONVERSION':
          add(flows.tradeAndProtocol, delta.currency, delta.amount);
          break;
        default:
          add(flows.other, delta.currency, delta.amount);
      }
    }
  }

  const closingBalances = [...balances.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    schemaVersion: CASH_LEDGER_SCHEMA_VERSION,
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    appliedEventIds: [...applied],
    closingBalances,
    flows,
  };
}
