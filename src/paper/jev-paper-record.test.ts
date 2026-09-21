import { describe, expect, it } from 'vitest';
import type { PaperObservation } from './public-market-observer.js';
import { jevPaperRecordToJsonl, makeJevPaperRecord } from './jev-paper-record.js';

describe('Jev paper records', () => {
  it('records deterministic and probabilistic evidence without secret-bearing fields', () => {
    const observation = {
      mode: 'PAPER_ONLY',
      conditionId: 'c1',
      yesTokenId: 'YES',
      noTokenId: 'NO',
      observedAt: 1000,
      status: 'PAPER_EXECUTABLE',
      rejectionReasons: [],
      result: {
        paperExecutable: true,
        quote: {
          expectedNetProfitUsd: 0.3,
          worstCaseNetProfitUsd: 0.2,
          expectedNetEdgeBps: 300,
          worstCaseNetEdgeBps: 200,
        },
      },
    } as PaperObservation;

    const record = makeJevPaperRecord(observation, {
      mode: 'PAPER_ONLY',
      promptVersion: 'jev-paper-judge-v1',
      judgedAt: 1100,
      deterministicStatus: 'PAPER_EXECUTABLE',
      probability: 0.91,
      status: 'ACCEPT',
    });

    const json = jevPaperRecordToJsonl(record);
    expect(record.schemaVersion).toBe('jev-paper-record-v1');
    expect(record.jev.probability).toBe(0.91);
    expect(json.toLowerCase()).not.toContain('privatekey');
    expect(json.toLowerCase()).not.toContain('wallet');
    expect(json.toLowerCase()).not.toContain('signer');
    expect(json.toLowerCase()).not.toContain('apikey');
  });
});
