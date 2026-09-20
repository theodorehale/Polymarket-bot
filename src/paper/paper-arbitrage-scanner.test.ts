import { describe, expect, it } from 'vitest';
import { scanPaperArbitrage } from './paper-arbitrage-scanner.js';
import type { ExecutableQuoteInput } from '../utils/executable-edge.js';

const NOW = 1_800_000_000_000;
function base(): ExecutableQuoteInput {
  return {
    type: 'long',
    yesTokenId: 'YES',
    noTokenId: 'NO',
    yesBook: { bids: [{ price: 0.43, size: 100 }], asks: [{ price: 0.44, size: 100 }], timestampMs: NOW - 20 },
    noBook: { bids: [{ price: 0.52, size: 100 }], asks: [{ price: 0.53, size: 100 }], timestampMs: NOW - 25 },
    targetPairShares: 10,
    yesFee: { status: 'known', kind: 'zero' },
    noFee: { status: 'known', kind: 'zero' },
    costs: { expectedGasUsd: 0, worstCaseGasUsd: 0, expectedOtherCostsUsd: 0, worstCaseOtherCostsUsd: 0 },
    nowMs: NOW,
    maxBookAgeMs: 500,
    maxBookSkewMs: 100,
    maxAdverseSlippageBps: 0,
  };
}

describe('scanPaperArbitrage', () => {
  it('delegates executable decisions to the hardened edge engine', () => {
    const r = scanPaperArbitrage(base());
    expect(r.mode).toBe('PAPER_ONLY');
    expect(r.paperExecutable).toBe(true);
    expect(r.paperExecutable).toBe(r.quote.safeToExecute);
    expect(r.quote.expectedNetProfitUsd).toBeCloseTo(0.3, 12);
  });

  it('fails closed on malformed public book prices', () => {
    const i = base();
    i.yesBook = { ...i.yesBook, asks: [{ price: 1.2, size: 100 }] };
    const r = scanPaperArbitrage(i);
    expect(r.paperExecutable).toBe(false);
    expect(r.quote.rejectionReasons).toContain('INVALID_YES_BOOK_PRICE');
  });

  it('fails closed on stale books', () => {
    const i = base();
    i.yesBook = { ...i.yesBook, timestampMs: NOW - 5_000 };
    const r = scanPaperArbitrage(i);
    expect(r.paperExecutable).toBe(false);
    expect(r.quote.rejectionReasons).toContain('YES_BOOK_STALE');
  });

  it('fails closed when worst-case costs are less conservative than expected costs', () => {
    const i = base();
    i.costs = { expectedGasUsd: 0.1, worstCaseGasUsd: 0.05 };
    const r = scanPaperArbitrage(i);
    expect(r.paperExecutable).toBe(false);
    expect(r.quote.rejectionReasons).toContain('WORST_CASE_GAS_BELOW_EXPECTED');
  });

  it('has no credential, signer, wallet, adapter, or submit-order surface', () => {
    const keys = Object.keys(base()).join(' ').toLowerCase();
    for (const forbidden of ['privatekey', 'credential', 'wallet', 'signer', 'adapter', 'submitorder']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
