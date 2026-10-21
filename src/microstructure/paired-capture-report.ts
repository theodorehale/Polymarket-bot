import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PolymarketBookReconstructor } from './polymarket-book-reconstructor.js';

interface RawEnvelope {
  stream: 'coinbase' | 'polymarket';
  endpoint: string;
  receivedAtMs: number;
  monotonicReceivedNs: string;
  raw: string;
}

interface ReconstructionReport {
  schemaVersion: 'hale-paired-reconstruction-v0.1';
  inputPath: string;
  decision: 'DELTA_RECONSTRUCTION_VERIFIED' | 'DELTA_RECONSTRUCTION_FAILED';
  rawRows: number;
  coinbaseTickerRows: number;
  polymarketBookRows: number;
  polymarketPriceChangeFrames: number;
  polymarketPriceChangeRows: number;
  bboChecks: number;
  bboMatches: number;
  bboMismatches: number;
  missingInitialSnapshot: number;
  parseErrors: number;
  invalidChanges: number;
  firstMonotonicNs?: string;
  lastMonotonicNs?: string;
  reasons: string[];
}

function finite(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLevels(value: unknown): Array<{ price: number; size: number }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const levels: Array<{ price: number; size: number }> = [];
  for (const level of value) {
    if (!level || typeof level !== 'object') return undefined;
    const price = finite((level as Record<string, unknown>).price);
    const size = finite((level as Record<string, unknown>).size);
    if (price === undefined || size === undefined) return undefined;
    levels.push({ price, size });
  }
  return levels;
}

export function buildPairedReconstructionReport(path: string): ReconstructionReport {
  const reconstructor = new PolymarketBookReconstructor();
  const report: ReconstructionReport = {
    schemaVersion: 'hale-paired-reconstruction-v0.1',
    inputPath: path,
    decision: 'DELTA_RECONSTRUCTION_FAILED',
    rawRows: 0,
    coinbaseTickerRows: 0,
    polymarketBookRows: 0,
    polymarketPriceChangeFrames: 0,
    polymarketPriceChangeRows: 0,
    bboChecks: 0,
    bboMatches: 0,
    bboMismatches: 0,
    missingInitialSnapshot: 0,
    parseErrors: 0,
    invalidChanges: 0,
    reasons: [],
  };

  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    report.rawRows += 1;

    let row: RawEnvelope;
    try {
      row = JSON.parse(line) as RawEnvelope;
    } catch {
      report.parseErrors += 1;
      continue;
    }

    if (typeof row.monotonicReceivedNs === 'string' && /^\d+$/.test(row.monotonicReceivedNs)) {
      report.firstMonotonicNs ??= row.monotonicReceivedNs;
      report.lastMonotonicNs = row.monotonicReceivedNs;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(row.raw);
    } catch {
      if (row.raw !== 'PONG') report.parseErrors += 1;
      continue;
    }

    if (row.stream === 'coinbase') {
      if (
        raw &&
        typeof raw === 'object' &&
        (raw as Record<string, unknown>).type === 'ticker' &&
        (raw as Record<string, unknown>).product_id === 'BTC-USD'
      ) report.coinbaseTickerRows += 1;
      continue;
    }

    const messages = Array.isArray(raw) ? raw : [raw];
    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        report.parseErrors += 1;
        continue;
      }
      const m = message as Record<string, unknown>;
      if (m.event_type === 'book') {
        const assetId = String(m.asset_id ?? '');
        const bids = parseLevels(m.bids);
        const asks = parseLevels(m.asks);
        if (!assetId || !bids || !asks) {
          report.parseErrors += 1;
          continue;
        }
        try {
          reconstructor.applySnapshot({ assetId, bids, asks });
          report.polymarketBookRows += 1;
        } catch {
          report.parseErrors += 1;
        }
        continue;
      }

      if (m.event_type !== 'price_change') continue;
      report.polymarketPriceChangeFrames += 1;
      const changes = Array.isArray(m.price_changes) ? m.price_changes : [];
      for (const rawChange of changes) {
        report.polymarketPriceChangeRows += 1;
        if (!rawChange || typeof rawChange !== 'object') {
          report.invalidChanges += 1;
          continue;
        }
        const c = rawChange as Record<string, unknown>;
        const assetId = String(c.asset_id ?? '');
        const price = finite(c.price);
        const size = finite(c.size);
        const bestBid = finite(c.best_bid);
        const bestAsk = finite(c.best_ask);
        const side = c.side;
        if (
          !assetId ||
          price === undefined ||
          size === undefined ||
          bestBid === undefined ||
          bestAsk === undefined ||
          (side !== 'BUY' && side !== 'SELL')
        ) {
          report.invalidChanges += 1;
          continue;
        }

        try {
          const result = reconstructor.applyPriceChange({
            assetId,
            price,
            size,
            side,
            reportedBestBid: bestBid,
            reportedBestAsk: bestAsk,
          });
          report.bboChecks += 1;
          if (result.matchesReportedBbo) report.bboMatches += 1;
          else report.bboMismatches += 1;
        } catch (error) {
          if (String(error).includes('MISSING_INITIAL_BOOK_SNAPSHOT')) {
            report.missingInitialSnapshot += 1;
          } else {
            report.invalidChanges += 1;
          }
        }
      }
    }
  }

  if (report.coinbaseTickerRows === 0) report.reasons.push('NO_COINBASE_TICKER_ROWS');
  if (report.polymarketBookRows === 0) report.reasons.push('NO_POLYMARKET_FULL_BOOK');
  if (report.polymarketPriceChangeRows === 0) report.reasons.push('NO_POLYMARKET_PRICE_CHANGES');
  if (report.bboMismatches > 0) report.reasons.push('RECONSTRUCTED_BBO_MISMATCH');
  if (report.missingInitialSnapshot > 0) report.reasons.push('PRICE_CHANGE_WITHOUT_BASELINE');
  if (report.parseErrors > 0) report.reasons.push('PARSE_ERRORS');
  if (report.invalidChanges > 0) report.reasons.push('INVALID_PRICE_CHANGES');
  if (report.bboChecks !== report.polymarketPriceChangeRows) {
    report.reasons.push('INCOMPLETE_BBO_CHECK_COVERAGE');
  }

  if (report.reasons.length === 0 && report.bboMatches === report.bboChecks) {
    report.decision = 'DELTA_RECONSTRUCTION_VERIFIED';
  }
  return report;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const input = resolve(process.argv[2] ?? process.env.HALE_PAIRED_RAW ?? 'data/microstructure/coinbase-paired-ci/paired-raw.jsonl');
  const output = resolve(
    process.argv[3] ?? process.env.HALE_PAIRED_RECONSTRUCTION_REPORT ?? `${dirname(input)}/paired-reconstruction-report.json`,
  );
  const report = buildPairedReconstructionReport(input);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify(report) + '\n');
  if (report.decision !== 'DELTA_RECONSTRUCTION_VERIFIED') process.exitCode = 2;
}
