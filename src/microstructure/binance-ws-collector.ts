import WebSocket from 'isomorphic-ws';
import type { BinanceTradePayload, UnifiedMarketEvent } from './types.js';

export interface BinanceWsCollectorOptions {
  symbol?: string;
  endpoint?: string;
}

type BinanceTradeMessage = {
  e: 'trade';
  E: number;
  s: string;
  t: number;
  p: string;
  q: string;
  T: number;
  m: boolean;
};

/**
 * Read-only Binance public trade collector for Hale 5M research.
 * No API key, account, wallet, or trading endpoint is used.
 */
export class BinanceWsCollector {
  private socket?: WebSocket;
  private readonly symbol: string;
  private readonly endpoint: string;

  constructor(options: BinanceWsCollectorOptions = {}) {
    this.symbol = (options.symbol ?? 'btcusdt').toLowerCase();
    this.endpoint = options.endpoint ?? 'wss://stream.binance.com:9443/ws';
  }

  connect(onEvent: (event: UnifiedMarketEvent<BinanceTradePayload>) => void): void {
    if (this.socket) throw new Error('BinanceWsCollector already connected');

    const url = `${this.endpoint}/${this.symbol}@trade`;
    this.socket = new WebSocket(url);

    this.socket.onmessage = (message) => {
      const receivedAtMs = Date.now();
      const monotonicReceivedNs = process.hrtime.bigint().toString();
      const raw = typeof message.data === 'string' ? message.data : message.data.toString();
      const parsed = JSON.parse(raw) as BinanceTradeMessage;
      if (parsed.e !== 'trade') return;

      const event: UnifiedMarketEvent<BinanceTradePayload> = {
        schemaVersion: 'hale-5m-event-v0.1',
        source: 'binance',
        kind: 'trade',
        instrument: parsed.s,
        clock: {
          sourceTimestampMs: parsed.T ?? parsed.E,
          receivedAtMs,
          monotonicReceivedNs,
        },
        sequence: String(parsed.t),
        payload: {
          symbol: parsed.s,
          tradeId: parsed.t,
          price: Number(parsed.p),
          quantity: Number(parsed.q),
          buyerIsMaker: parsed.m,
        },
      };

      onEvent(event);
    };
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }
}
