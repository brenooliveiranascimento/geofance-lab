import {
  computeBackoffMs,
  parseEndpoint,
  readDeliveryEndpoint,
  type BackoffConfig,
} from '../receiptSender';

const CONFIG: BackoffConfig = {
  maxAttempts: 10,
  baseDelayMs: 30_000,
  maxDelayMs: 60 * 60 * 1_000,
};

describe('computeBackoffMs', () => {
  it('doubles the delay on each attempt', () => {
    expect(computeBackoffMs(0, CONFIG)).toBe(30_000);
    expect(computeBackoffMs(1, CONFIG)).toBe(60_000);
    expect(computeBackoffMs(2, CONFIG)).toBe(120_000);
    expect(computeBackoffMs(3, CONFIG)).toBe(240_000);
  });

  it('saturates at the ceiling instead of growing without bound', () => {
    expect(computeBackoffMs(6, CONFIG)).toBe(32 * 60_000);
    expect(computeBackoffMs(7, CONFIG)).toBe(CONFIG.maxDelayMs);
    expect(computeBackoffMs(9, CONFIG)).toBe(CONFIG.maxDelayMs);
  });

  it('gives up once the attempts are spent', () => {
    expect(computeBackoffMs(CONFIG.maxAttempts, CONFIG)).toBeNull();
    expect(computeBackoffMs(CONFIG.maxAttempts + 5, CONFIG)).toBeNull();
  });

  it('never returns a shrinking delay', () => {
    const delays = Array.from({ length: CONFIG.maxAttempts }, (_, i) => computeBackoffMs(i, CONFIG)!);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it('spans hours before exhausting, not seconds', () => {
    const total = Array.from({ length: CONFIG.maxAttempts }, (_, i) =>
      computeBackoffMs(i, CONFIG)!,
    ).reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeGreaterThan(3 * 60 * 60 * 1_000);
    expect(total).toBeLessThan(6 * 60 * 60 * 1_000);
  });

  it('honours a single-attempt configuration', () => {
    const once: BackoffConfig = { ...CONFIG, maxAttempts: 1 };
    expect(computeBackoffMs(0, once)).toBe(30_000);
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
  it('falls back to the build-time default when nothing is stored', () => {
    expect(readDeliveryEndpoint()).toBe(process.env.EXPO_PUBLIC_DELIVERY_ENDPOINT ?? '');
  });
});
