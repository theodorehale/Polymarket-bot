import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BinanceWsCollector } from './binance-ws-collector.js';
import { PolymarketRtdsCollector } from './polymarket-rtds-collector.js';

interface PersistedEnvelope {
  recordedAtMs: number;
  stream: 'binance' | 'polymarket';
  accepted: boolean;
  reason?: string;
  event?: unknown;
  raw?: unknown;
}

function appendJsonl(path: string, row: PersistedEnvelope): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(row) + '\n', 'utf8');
}

const tokenIds = (process.env.POLYMARKET_TOKEN_IDS ?? '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);

if (tokenIds.length === 0) {
  throw new Error('Set POLYMARKET_TOKEN_IDS as a comma-separated list before starting the paper collector');
}

const outputPath = resolve(
  process.env.HALE_5M_OUTPUT ?? 'data/microstructure/hale-5m-events.jsonl',
);

const binance = new BinanceWsCollector({
  symbol: process.env.BINANCE_SYMBOL ?? 'btcusdt',
});

const polymarket = new PolymarketRtdsCollector({ tokenIds });

let binanceCount = 0;
let polyAccepted = 0;
let polyRejected = 0;

binance.connect(event => {
  binanceCount += 1;
  appendJsonl(outputPath, {
    recordedAtMs: Date.now(),
    stream: 'binance',
    accepted: true,
    event,
  });
});

polymarket.connect((result, raw) => {
  if (result.evidence.accepted && result.event) {
    polyAccepted += 1;
    appendJsonl(outputPath, {
      recordedAtMs: Date.now(),
      stream: 'polymarket',
      accepted: true,
      reason: result.evidence.reason,
      event: result.event,
    });
    return;
  }

  polyRejected += 1;
  appendJsonl(outputPath, {
    recordedAtMs: Date.now(),
    stream: 'polymarket',
    accepted: false,
    reason: result.evidence.reason,
    raw: {
      topic: raw.topic,
      type: raw.type,
      timestamp: raw.timestamp,
      payload: raw.payload,
    },
  });
});

const statsTimer = setInterval(() => {
  process.stdout.write(
    JSON.stringify({
      outputPath,
      binanceCount,
      polyAccepted,
      polyRejected,
      at: new Date().toISOString(),
    }) + '\n',
  );
}, 10_000);

function shutdown(): void {
  clearInterval(statsTimer);
  binance.close();
  polymarket.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
