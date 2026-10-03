import { RealTimeDataClient, type Message } from '@polymarket/real-time-data-client';
import type { PolymarketBookPayload, UnifiedMarketEvent } from './types.js';
import { parseClobMarketMessage, type ParsedClobMarketEvidence } from './polymarket-rtds-adapter.js';

export interface PolymarketRtdsCollectorOptions {
  tokenIds: string[];
  autoReconnect?: boolean;
  pingInterval?: number;
}

export type PolymarketEvidenceHandler = (
  result: ParsedClobMarketEvidence,
  rawMessage: Message,
) => void;

/**
 * Read-only Polymarket RTDS collector for clob_market aggregate orderbooks.
 * No auth, wallet, signing, or trading endpoints are used.
 */
export class PolymarketRtdsCollector {
  private client?: RealTimeDataClient;
  private readonly tokenIds: string[];
  private readonly autoReconnect: boolean;
  private readonly pingInterval: number;

  constructor(options: PolymarketRtdsCollectorOptions) {
    this.tokenIds = [...new Set(options.tokenIds.map(x => x.trim()).filter(Boolean))];
    if (this.tokenIds.length === 0) throw new Error('PolymarketRtdsCollector requires tokenIds');
    this.autoReconnect = options.autoReconnect ?? true;
    this.pingInterval = options.pingInterval ?? 5_000;
  }

  connect(onEvidence: PolymarketEvidenceHandler): void {
    if (this.client) throw new Error('PolymarketRtdsCollector already connected');

    const client = new RealTimeDataClient({
      autoReconnect: this.autoReconnect,
      pingInterval: this.pingInterval,
      onConnect: connectedClient => {
        connectedClient.subscribe({
          subscriptions: [{
            topic: 'clob_market',
            type: 'agg_orderbook',
            filters: JSON.stringify(this.tokenIds),
          }],
        });
      },
      onMessage: (_client, message) => {
        if (message.topic !== 'clob_market') return;

        const receivedAtMs = Date.now();
        const monotonicReceivedNs = process.hrtime.bigint().toString();

        const result = parseClobMarketMessage(
          {
            topic: message.topic,
            type: message.type,
            timestamp: message.timestamp,
            payload: message.payload as import('./polymarket-rtds-adapter.js').RawClobBook | undefined,
          },
          receivedAtMs,
          monotonicReceivedNs,
        );

        onEvidence(result, message);
      },
    });

    this.client = client;
    client.connect();
  }

  close(): void {
    this.client?.disconnect();
    this.client = undefined;
  }
}

export type AcceptedPolymarketBookEvent = UnifiedMarketEvent<PolymarketBookPayload>;
