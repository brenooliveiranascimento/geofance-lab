export const MESSAGING_CONFIG = {
  onboarding: {
    offsetsMinutes: [2, 5, 12, 25, 45],
  },

  daily: {
    hour: 9,
    minute: 0,
    weeks: 4,
    perWeek: 7,
    startsAfterOnboardingDays: 1,
  },

  scheduleHorizon: 40,

  receipts: {
    maxAttempts: 15,
    baseDelayMs: 30_000,
    maxDelayMs: 4 * 60 * 60 * 1_000,
    requestTimeoutMs: 15_000,
  },
} as const;

export const MESSAGING_KEYS = {
  enrolledAt: 'messaging.enrolledAt',
  deliveryEndpoint: 'messaging.deliveryEndpoint',
} as const;

export const MESSAGING_TASK = 'geofence-lab.messaging';

export const DELIVERY_ENDPOINT_DEFAULT = process.env.EXPO_PUBLIC_DELIVERY_ENDPOINT ?? '';
