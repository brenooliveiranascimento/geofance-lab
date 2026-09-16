export const MESSAGING_CONFIG = {
  onboarding: {
    /**
     * Minutes after signup. The brief asks for delivery "minutes after
     * registration" in a fixed linear order; the offsets are strictly
     * increasing, which is what makes the order a property of the schedule
     * rather than something the app has to enforce at delivery time.
     */
    offsetsMinutes: [2, 5, 12, 25, 45],
  },

  daily: {
    /** Local wall-clock time. Computed per day so DST shifts do not drift it. */
    hour: 9,
    minute: 0,
    weeks: 4,
    perWeek: 7,
    /** Days after the last onboarding message that the daily run begins. */
    startsAfterOnboardingDays: 1,
  },

  /**
   * How many future notifications are handed to the OS at any one time.
   *
   * iOS keeps at most 64 pending local notification requests and silently drops
   * whatever exceeds that, so scheduling all 33 messages plus any future run
   * would be gambling. A rolling window, topped up on every reconciliation, keeps
   * us well clear of the ceiling and makes a content change take effect without
   * having to cancel dozens of already-queued notifications.
   */
  scheduleHorizon: 24,

  receipts: {
    /**
     * Ten attempts on a 30 s base, capped at an hour, spans roughly four hours
     * of retrying — enough to ride out a night offline or a server restart
     * without retrying forever. The cap is reached at the eighth attempt, so it
     * is a real limit rather than decoration.
     */
    maxAttempts: 10,
    baseDelayMs: 30_000,
    maxDelayMs: 60 * 60 * 1_000,
    requestTimeoutMs: 15_000,
  },
} as const;

export const MESSAGING_KEYS = {
  enrolledAt: 'messaging.enrolledAt',
  lastReconciledAt: 'messaging.lastReconciledAt',
} as const;

export const MESSAGING_TASK = 'geofence-lab.messaging';

/** Where delivery confirmations are POSTed. Empty disables the sender. */
export const DELIVERY_ENDPOINT = process.env.EXPO_PUBLIC_DELIVERY_ENDPOINT ?? '';
