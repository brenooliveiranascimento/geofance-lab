import { computeBackoffMs, type BackoffConfig } from '../receiptSender';

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
    // 30 s doubled seven times is 64 min, past the one-hour cap.
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
    // Enough to survive a night offline without retrying indefinitely.
    expect(total).toBeGreaterThan(3 * 60 * 60 * 1_000);
    expect(total).toBeLessThan(6 * 60 * 60 * 1_000);
  });

  it('honours a single-attempt configuration', () => {
    const once: BackoffConfig = { ...CONFIG, maxAttempts: 1 };
    expect(computeBackoffMs(0, once)).toBe(30_000);
    expect(computeBackoffMs(1, once)).toBeNull();
  });
});
