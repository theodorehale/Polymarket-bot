import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_EVENT_SCHEMA_VERSION,
  type NormalizedEventV1,
} from './normalized-event.js';
import { replayCashLedger } from './cash-ledger.js';

function baseEvent(
  id: string,
  eventType: NormalizedEventV1['eventType'],
  amount: number,
  treatment: NormalizedEventV1['accountingTreatment'],
): NormalizedEventV1 {
  return {
    schemaVersion: NORMALIZED_EVENT_SCHEMA_VERSION,
    normalizedEventId: id,
    rawEvidenceId: 'raw-' + id,
    parserVersion: 'parser-v1',
    eventType,
    assetDeltas: [],
    cashDeltas: [{ amount, currency: 'USDC' }],
    accountingTreatment: treatment,
    notes: [],
  };
}

describe('CashLedger replay', () => {
  it('replays deposits, withdrawals, fees and protocol cashflows', () => {
    const result = replayCashLedger({
      openingBalances: [{ currency: 'USDC', amount: 100 }],
      events: [
        baseEvent('d1', 'DEPOSIT', 1000, 'CASH_MOVEMENT_ONLY'),
        baseEvent('t1', 'TRADE', -200, 'TRADE_OR_PROTOCOL'),
        baseEvent('f1', 'FEE', -2, 'FEE'),
        baseEvent('r1', 'REBATE', 1, 'INCENTIVE'),
        baseEvent('w1', 'WITHDRAWAL', -100, 'CASH_MOVEMENT_ONLY'),
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.closingBalances).toEqual([
      { currency: 'USDC', amount: 799 },
    ]);
    expect(result.flows.deposits.USDC).toBe(1000);
    expect(result.flows.withdrawals.USDC).toBe(-100);
    expect(result.flows.fees.USDC).toBe(-2);
    expect(result.flows.incentives.USDC).toBe(1);
    expect(result.flows.tradeAndProtocol.USDC).toBe(-200);
  });

  it('does not treat deposits as strategy PnL', () => {
    const result = replayCashLedger({
      events: [baseEvent('d1', 'DEPOSIT', 5000, 'CASH_MOVEMENT_ONLY')],
    });

    expect(result.flows.deposits.USDC).toBe(5000);
    expect(result.flows.tradeAndProtocol.USDC).toBeUndefined();
    expect(result.flows.incentives.USDC).toBeUndefined();
  });

  it('fails closed on duplicate normalized event ids', () => {
    const event = baseEvent('x', 'TRADE', -10, 'TRADE_OR_PROTOCOL');
    const result = replayCashLedger({ events: [event, event] });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('DUPLICATE_NORMALIZED_EVENT_ID');
    expect(result.closingBalances).toEqual([
      { currency: 'USDC', amount: -10 },
    ]);
  });

  it('rejects invalid normalized events before applying cash deltas', () => {
    const event = baseEvent('bad', 'TRADE', -10, 'TRADE_OR_PROTOCOL');
    event.rawEvidenceId = '';

    const result = replayCashLedger({ events: [event] });
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('INVALID_NORMALIZED_EVENT');
    expect(result.closingBalances).toEqual([]);
  });

  it('keeps currencies separate', () => {
    const usdc = baseEvent('u', 'OTHER_SUPPORTED', 2, 'UNKNOWN');
    const usd = baseEvent('d', 'OTHER_SUPPORTED', 3, 'UNKNOWN');
    usd.cashDeltas = [{ amount: 3, currency: 'USD' }];

    const result = replayCashLedger({ events: [usdc, usd] });
    expect(result.closingBalances).toEqual([
      { currency: 'USD', amount: 3 },
      { currency: 'USDC', amount: 2 },
    ]);
  });
});
