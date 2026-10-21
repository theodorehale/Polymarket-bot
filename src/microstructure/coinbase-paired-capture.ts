import WebSocket from 'ws';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { discoverBtcFiveMinuteMarket } from './market-discovery.js';

type StreamName = 'coinbase' | 'polymarket';

interface RawEnvelope {
  stream: StreamName;
  endpoint: string;
  receivedAtMs: number;
  monotonicReceivedNs: string;
  raw: string;
}

interface EndpointState {
  endpoint: string;
  opened: boolean;
  messages: number;
  validEvents: number;
  invalidEvents: number;
  closedEarly: boolean;
  error?: string;
  httpStatus?: number;
}

const durationMs = Number(process.env.HALE_5M_DURATION_MS ?? 30_000);
if (!Number.isFinite(durationMs) || durationMs < 1_000 || durationMs > 120_000) {
  throw new Error('INVALID_CAPTURE_DURATION');
}

const outputDir = resolve(
  process.env.HALE_5M_CAPTURE_DIR ??
    `data/microstructure/coinbase-paired-${new Date().toISOString().replaceAll(':', '-')}`,
);
mkdirSync(outputDir, { recursive: true });

const saveJson = (name: string, value: unknown): void => {
  writeFileSync(resolve(outputDir, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
};

const rawPath = resolve(outputDir, 'paired-raw.jsonl');
writeFileSync(rawPath, '', { flag: 'wx' });

function appendRaw(stream: StreamName, endpoint: string, raw: string): void {
  const row: RawEnvelope = {
    stream,
    endpoint,
    receivedAtMs: Date.now(),
    monotonicReceivedNs: process.hrtime.bigint().toString(),
    raw,
  };
  appendFileSync(rawPath, JSON.stringify(row) + '\n', 'utf8');
}

async function recordOrderEligibility(): Promise<void> {
  const endpoint = 'https://polymarket.com/api/geoblock';
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    const body = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body.slice(0, 2_000) };
    }
    saveJson('polymarket-order-eligibility.json', {
      endpoint,
      recordedAt: new Date().toISOString(),
      httpStatus: response.status,
      purpose: 'ORDER_ELIGIBILITY_ONLY_NO_TRADING',
      response: parsed,
    });
  } catch (error) {
    saveJson('polymarket-order-eligibility.json', {
      endpoint,
      recordedAt: new Date().toISOString(),
      purpose: 'ORDER_ELIGIBILITY_ONLY_NO_TRADING',
      decision: 'UNAVAILABLE_NO_TRADING_ATTEMPTED',
      error: String(error),
    });
  }
}

const startedAt = new Date().toISOString();
const market = await discoverBtcFiveMinuteMarket();
await recordOrderEligibility();

const outcomeMap = market.tokenIds.map((tokenId, index) => ({
  tokenId,
  outcome: market.outcomes[index],
}));

saveJson('market-identity.json', {
  strategyIdentity: 'COINBASE_BTCUSD_TO_POLYMARKET_BTC_5M',
  sourceIdentity: {
    spot: 'COINBASE_EXCHANGE_PUBLIC_BTC-USD_TICKER',
    predictionMarket: 'POLYMARKET_PUBLIC_CLOB_MARKET_WS',
  },
  recordedAt: new Date().toISOString(),
  market,
  outcomeMap,
});

const coinbaseEndpoint = 'wss://ws-feed.exchange.coinbase.com';
const polymarketEndpoint = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

const coinbaseState: EndpointState = {
  endpoint: coinbaseEndpoint,
  opened: false,
  messages: 0,
  validEvents: 0,
  invalidEvents: 0,
  closedEarly: false,
};
const polymarketState: EndpointState = {
  endpoint: polymarketEndpoint,
  opened: false,
  messages: 0,
  validEvents: 0,
  invalidEvents: 0,
  closedEarly: false,
};

const coinbaseTypes: Record<string, number> = {};
const polymarketTypes: Record<string, number> = {};
let firstCoinbaseMonotonicNs: string | undefined;
let lastCoinbaseMonotonicNs: string | undefined;
let firstPolymarketMonotonicNs: string | undefined;
let lastPolymarketMonotonicNs: string | undefined;

const coinbase = new WebSocket(coinbaseEndpoint, {
  handshakeTimeout: 10_000,
  followRedirects: false,
});
const polymarket = new WebSocket(polymarketEndpoint, {
  handshakeTimeout: 10_000,
  followRedirects: false,
});

let finished = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let polymarketPing: ReturnType<typeof setInterval> | undefined;

function endpointUnexpectedResponse(state: EndpointState, response: import('node:http').IncomingMessage): void {
  state.httpStatus = response.statusCode;
  state.error = `HTTP_${response.statusCode ?? 'UNKNOWN'}`;
  response.resume();
}

coinbase.on('open', () => {
  coinbaseState.opened = true;
  coinbase.send(JSON.stringify({
    type: 'subscribe',
    product_ids: ['BTC-USD'],
    channels: ['ticker', 'heartbeat'],
  }));
});

coinbase.on('message', data => {
  const raw = data.toString();
  appendRaw('coinbase', coinbaseEndpoint, raw);
  coinbaseState.messages += 1;

  try {
    const message = JSON.parse(raw) as Record<string, unknown>;
    const type = typeof message.type === 'string' ? message.type : 'UNKNOWN';
    coinbaseTypes[type] = (coinbaseTypes[type] ?? 0) + 1;

    if (type !== 'ticker') return;
    const productId = message.product_id;
    const price = Number(message.price);
    const sourceTimeMs = Date.parse(String(message.time ?? ''));
    const sequence = Number(message.sequence);
    const tradeId = Number(message.trade_id);
    if (
      productId !== 'BTC-USD' ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(sourceTimeMs) ||
      !Number.isSafeInteger(sequence) ||
      !Number.isSafeInteger(tradeId)
    ) {
      coinbaseState.invalidEvents += 1;
      return;
    }

    const mono = process.hrtime.bigint().toString();
    firstCoinbaseMonotonicNs ??= mono;
    lastCoinbaseMonotonicNs = mono;
    coinbaseState.validEvents += 1;
  } catch {
    coinbaseState.invalidEvents += 1;
  }
});

coinbase.on('unexpected-response', (_request, response) => {
  endpointUnexpectedResponse(coinbaseState, response);
  finish('COINBASE_ACCESS_ERROR');
});
coinbase.on('error', error => {
  coinbaseState.error = error.message;
});
coinbase.on('close', () => {
  if (!finished) {
    coinbaseState.closedEarly = true;
    finish('COINBASE_EARLY_DISCONNECT');
  }
});

polymarket.on('open', () => {
  polymarketState.opened = true;
  polymarket.send(JSON.stringify({
    assets_ids: market.tokenIds,
    type: 'market',
  }));
  polymarketPing = setInterval(() => {
    if (polymarket.readyState === WebSocket.OPEN) polymarket.send('PING');
  }, 10_000);
});

polymarket.on('message', data => {
  const raw = data.toString();
  appendRaw('polymarket', polymarketEndpoint, raw);
  polymarketState.messages += 1;
  if (raw === 'PONG') return;

  try {
    const parsed = JSON.parse(raw);
    for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
      const type = typeof message?.event_type === 'string' ? message.event_type : 'UNKNOWN';
      polymarketTypes[type] = (polymarketTypes[type] ?? 0) + 1;
      if (type !== 'book') continue;

      if (
        message.market !== market.conditionId ||
        !market.tokenIds.includes(String(message.asset_id ?? '')) ||
        !Number.isFinite(Number(message.timestamp)) ||
        !Array.isArray(message.bids) ||
        !Array.isArray(message.asks)
      ) {
        polymarketState.invalidEvents += 1;
        continue;
      }

      const mono = process.hrtime.bigint().toString();
      firstPolymarketMonotonicNs ??= mono;
      lastPolymarketMonotonicNs = mono;
      polymarketState.validEvents += 1;
    }
  } catch {
    polymarketState.invalidEvents += 1;
  }
});

polymarket.on('unexpected-response', (_request, response) => {
  endpointUnexpectedResponse(polymarketState, response);
  finish('POLYMARKET_ACCESS_ERROR');
});
polymarket.on('error', error => {
  polymarketState.error = error.message;
});
polymarket.on('close', () => {
  if (!finished) {
    polymarketState.closedEarly = true;
    finish('POLYMARKET_EARLY_DISCONNECT');
  }
});

function finish(trigger: string): void {
  if (finished) return;
  finished = true;
  if (timer) clearTimeout(timer);
  if (polymarketPing) clearInterval(polymarketPing);

  if (coinbase.readyState === WebSocket.OPEN || coinbase.readyState === WebSocket.CONNECTING) {
    coinbase.terminate();
  }
  if (polymarket.readyState === WebSocket.OPEN || polymarket.readyState === WebSocket.CONNECTING) {
    polymarket.terminate();
  }

  const raw = readFileSync(rawPath);
  const gz = gzipSync(raw, { level: 9 });
  const gzPath = rawPath + '.gz';
  writeFileSync(gzPath, gz);
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');

  const paired =
    coinbaseState.validEvents > 0 &&
    polymarketState.validEvents > 0 &&
    !coinbaseState.httpStatus &&
    !polymarketState.httpStatus;

  const decision = paired ? 'PAIRED_PUBLIC_DATA_CAPTURED' : 'PAIRED_DATA_UNAVAILABLE';
  const summary = {
    schemaVersion: 'hale-paired-capture-v0.1',
    strategyIdentity: 'COINBASE_BTCUSD_TO_POLYMARKET_BTC_5M',
    decision,
    trigger,
    startedAt,
    endedAt: new Date().toISOString(),
    market: {
      id: market.id,
      conditionId: market.conditionId,
      slug: market.slug,
      question: market.question,
      endDate: market.endDate,
      outcomeMap,
    },
    coinbase: {
      ...coinbaseState,
      productId: 'BTC-USD',
      channel: 'ticker',
      messageTypes: coinbaseTypes,
      firstValidMonotonicNs: firstCoinbaseMonotonicNs,
      lastValidMonotonicNs: lastCoinbaseMonotonicNs,
    },
    polymarket: {
      ...polymarketState,
      messageTypes: polymarketTypes,
      firstValidMonotonicNs: firstPolymarketMonotonicNs,
      lastValidMonotonicNs: lastPolymarketMonotonicNs,
    },
    evidence: {
      rawBytes: raw.length,
      gzipBytes: gz.length,
      rawSha256: hash(raw),
      gzipSha256: hash(gz),
    },
    safety: {
      mode: 'READ_ONLY_PUBLIC_DATA',
      credentialsUsed: false,
      walletUsed: false,
      ordersSubmitted: false,
      proxyOrVpnUsed: false,
      fallbackEndpointUsed: false,
    },
  };

  saveJson('paired-capture-summary.json', summary);
  process.stdout.write(JSON.stringify({ outputDir, ...summary }) + '\n');
  if (!paired) process.exitCode = 2;
}

const marketRemainingMs = Date.parse(market.endDate) - Date.now();
if (!Number.isFinite(marketRemainingMs) || marketRemainingMs <= 0) {
  finish('MARKET_EXPIRED_BEFORE_CAPTURE');
} else {
  timer = setTimeout(
    () => finish('BOUNDED_DURATION_COMPLETE'),
    Math.min(durationMs, marketRemainingMs),
  );
}

process.on('SIGINT', () => finish('INTERRUPTED'));
process.on('SIGTERM', () => finish('INTERRUPTED'));
