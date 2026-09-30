/**
 * Phase 5.1 deterministic token/share ledger replay.
 *
 * Replays only normalized asset deltas. Cash is handled by a separate ledger.
 * The ledger is accounting infrastructure, not a PnL engine.
 */
import { type NormalizedEventV1, validateNormalizedEvent } from './normalized-event.js';

export const TOKEN_LEDGER_SCHEMA_VERSION = 'token-ledger-v1' as const;

export interface TokenBalance {
  assetId: string;
  unit: 'TOKEN' | 'COLLATERAL' | 'SHARE' | 'OTHER';
  amount: number;
}

export interface TokenLedgerReplayInput {
  openingBalances?: TokenBalance[];
  events: NormalizedEventV1[];
}

export interface TokenLedgerReplayResult {
  schemaVersion: typeof TOKEN_LEDGER_SCHEMA_VERSION;
  valid: boolean;
  reasons: string[];
  appliedEventIds: string[];
  closingBalances: TokenBalance[];
}

const keyOf = (assetId: string, unit: TokenBalance['unit']): string =>
  `${unit}:${assetId}`;

const parseKey = (key: string): Pick<TokenBalance, 'assetId' | 'unit'> => {
  const separator = key.indexOf(':');
  const unit = key.slice(0, separator) as TokenBalance['unit'];
  const assetId = key.slice(separator + 1);
  return { assetId, unit };
};

export function replayTokenLedger(
  input: TokenLedgerReplayInput,
): TokenLedgerReplayResult {
  const reasons: string[] = [];
  const balances = new Map<string, number>();
  const applied = new Set<string>();

  for (const opening of input.openingBalances ?? []) {
    if (!opening.assetId.trim()) {
      reasons.push('OPENING_BALANCE_MISSING_ASSET_ID');
      continue;
    }
    if (!Number.isFinite(opening.amount)) {
      reasons.push('OPENING_BALANCE_INVALID_AMOUNT');
      continue;
    }
    const key = keyOf(opening.assetId, opening.unit);
    if (balances.has(key)) reasons.push('DUPLICATE_OPENING_BALANCE');
    balances.set(key, (balances.get(key) ?? 0) + opening.amount);
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

    for (const delta of event.assetDeltas) {
      const key = keyOf(delta.assetId, delta.unit);
      const next = (balances.get(key) ?? 0) + delta.amount;
      if (!Number.isFinite(next)) {
        reasons.push('NON_FINITE_LEDGER_BALANCE');
        continue;
      }
      balances.set(key, next);
    }
  }

  const closingBalances = [...balances.entries()]
    .map(([key, amount]) => ({ ...parseKey(key), amount }))
    .sort((a, b) =>
      a.unit === b.unit
        ? a.assetId.localeCompare(b.assetId)
        : a.unit.localeCompare(b.unit),
    );

  return {
    schemaVersion: TOKEN_LEDGER_SCHEMA_VERSION,
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    appliedEventIds: [...applied],
    closingBalances,
  };
}
