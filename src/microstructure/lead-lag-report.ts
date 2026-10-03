import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizeLeadLag } from './lead-lag-stats.js';
import type { LeadLagObservation } from './types.js';

const input = resolve(process.argv[2] ?? process.env.HALE_5M_OUTPUT ?? 'data/microstructure/hale-5m-events.jsonl');
const rows = readFileSync(input, 'utf8').split(/\r?\n/).filter(Boolean);
const observations: LeadLagObservation[] = [];

for (const line of rows) {
  try {
    const row = JSON.parse(line) as { reason?: string; event?: LeadLagObservation };
    if (row.reason === 'LEAD_LAG_OBSERVATION' && row.event?.schemaVersion === 'hale-5m-leadlag-v0.1') {
      observations.push(row.event);
    }
  } catch {
    // Fail closed on malformed lines: exclude them from scientific summary.
  }
}

process.stdout.write(JSON.stringify({ input, ...summarizeLeadLag(observations) }, null, 2) + '\n');
