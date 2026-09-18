import * as Network from 'expo-network';

import { resetDatabase } from '@src/core/db';

import {
  computeBackoffMs,
  drainReceipts,
  enqueueReceipt,
  parseEndpoint,
  readDeliveryEndpoint,
  writeDeliveryEndpoint,
  type BackoffConfig,
} from '../receiptSender';

const DEFAULT_ENDPOINT = process.env.EXPO_PUBLIC_DELIVERY_ENDPOINT ?? '';

const CONFIG: BackoffConfig = {
  maxAttempts: 15,
  baseDelayMs: 30_000,
  maxDelayMs: 4 * 60 * 60 * 1_000,
};

const everyDelay = () =>
  Array.from({ length: CONFIG.maxAttempts - 1 }, (_, i) => computeBackoffMs(i + 1, CONFIG)!);

describe('computeBackoffMs', () => {
  it('counts attempts already made, so the first retry waits the base delay', () => {
    expect(computeBackoffMs(1, CONFIG)).toBe(30_000);
    expect(computeBackoffMs(2, CONFIG)).toBe(60_000);
    expect(computeBackoffMs(3, CONFIG)).toBe(120_000);
    expect(computeBackoffMs(4, CONFIG)).toBe(240_000);
  });

  it('saturates at the ceiling instead of growing without bound', () => {
    expect(computeBackoffMs(9, CONFIG)).toBe(128 * 60_000);
    expect(computeBackoffMs(10, CONFIG)).toBe(CONFIG.maxDelayMs);
    expect(computeBackoffMs(14, CONFIG)).toBe(CONFIG.maxDelayMs);
  });

  it('gives up once the attempts are spent', () => {
    expect(computeBackoffMs(CONFIG.maxAttempts, CONFIG)).toBeNull();
    expect(computeBackoffMs(CONFIG.maxAttempts + 5, CONFIG)).toBeNull();
  });

  it('never returns a shrinking delay', () => {
    const delays = everyDelay();
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it('spans a day of online failures before exhausting', () => {
    const total = everyDelay().reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeGreaterThan(20 * 60 * 60 * 1_000);
    expect(total).toBeLessThan(30 * 60 * 60 * 1_000);
  });

  it('honours a single-attempt configuration', () => {
    const once: BackoffConfig = { ...CONFIG, maxAttempts: 1 };
    expect(computeBackoffMs(1, once)).toBeNull();
  });
});

describe('parseEndpoint', () => {
  it('accepts http and https', () => {
    expect(parseEndpoint('https://webhook.site/abc')).toEqual({
      valid: true,
      value: 'https://webhook.site/abc',
    });
    expect(parseEndpoint('http://192.168.1.10:3000/receipts').valid).toBe(true);
  });

  it('treats empty as switching sending off', () => {
    expect(parseEndpoint('')).toEqual({ valid: true, value: '' });
    expect(parseEndpoint('   ')).toEqual({ valid: true, value: '' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseEndpoint('  https://webhook.site/abc  ').value).toBe('https://webhook.site/abc');
  });

  it('drops trailing slashes so the same URL is stored one way', () => {
    expect(parseEndpoint('https://webhook.site/abc//').value).toBe('https://webhook.site/abc');
  });

  it('rejects a URL with no scheme', () => {
    expect(parseEndpoint('webhook.site/abc').valid).toBe(false);
  });

  it('rejects other schemes', () => {
    expect(parseEndpoint('ftp://example.com').valid).toBe(false);
    expect(parseEndpoint('javascript:alert(1)').valid).toBe(false);
  });

  it('rejects anything with whitespace inside', () => {
    expect(parseEndpoint('https://webhook.site/a b').valid).toBe(false);
  });

  it('keeps the raw text when rejecting, so the field is not cleared', () => {
    expect(parseEndpoint('webhook.site').value).toBe('webhook.site');
  });
});

describe('readDeliveryEndpoint', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('prefers what the user saved in the app', () => {
    writeDeliveryEndpoint('https://webhook.site/saved');
    expect(readDeliveryEndpoint()).toBe('https://webhook.site/saved');
  });

  it('treats an empty value as a request for the build default', () => {
    writeDeliveryEndpoint('https://webhook.site/saved');
    writeDeliveryEndpoint('');
    expect(readDeliveryEndpoint()).toBe(DEFAULT_ENDPOINT);
  });
});

describe('drainReceipts', () => {
  const receipt = (position: number) => ({
    idempotencyKey: `1000:daily:${position}`,
    sequence: 'daily' as const,
    position,
    messageId: `d-1-${position}`,
    subtitle: `Semana 1; Mensagem ${position} de 7`,
    deliveredAt: 5_000,
  });

  beforeEach(() => {
    resetDatabase();
    writeDeliveryEndpoint('https://webhook.site/test');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('confirms a receipt the endpoint accepts and stops retrying it', async () => {
    enqueueReceipt(receipt(0));
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    expect(await drainReceipts()).toMatchObject({ attempted: 1, confirmed: 1 });
    expect(await drainReceipts()).toMatchObject({ attempted: 0 });
  });

  it('does not spend an attempt while the device is offline', async () => {
    enqueueReceipt(receipt(1));
    jest
      .spyOn(Network, 'getNetworkStateAsync')
      .mockResolvedValue({ isInternetReachable: false } as never);
    global.fetch = jest.fn() as unknown as typeof fetch;

    expect(await drainReceipts()).toMatchObject({ attempted: 0, offline: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends the idempotency key the receipt was stored with', async () => {
    enqueueReceipt(receipt(2));
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await drainReceipts();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('1000:daily:2');
  });
});
