import { describe, expect, it } from 'vitest';
import { PolymarketSDK } from './index.js';

describe('credential-free SDK isolation', () => {
  it('does not construct an authenticated TradingService without a private key', () => {
    const sdk = new PolymarketSDK();
    expect(sdk.tradingService).toBeNull();
    expect(sdk.isInitialized()).toBe(false);
    sdk.stop();
  });

  it('fails closed if trading initialization is requested without credentials', async () => {
    const sdk = new PolymarketSDK();
    await expect(sdk.initialize()).rejects.toThrow(
      'Trading initialization requires an explicit private key'
    );
    expect(sdk.isInitialized()).toBe(false);
    sdk.stop();
  });

  it('does not synthesize a dummy wallet when credentials are absent', () => {
    const sdk = new PolymarketSDK({ privateKey: undefined });
    expect(sdk.tradingService).toBeNull();
    sdk.stop();
  });
});
