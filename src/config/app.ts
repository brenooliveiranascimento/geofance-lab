/**
 * Central app configuration. Nothing product-specific should be hardcoded in a
 * feature — read it from here, and read visual tokens from `@src/theme`.
 */
export const APP_CONFIG = {
  appName: 'Geofence Lab',

  /** Locales bundled in src/i18n/locales. First entry is the fallback. */
  supportedLocales: ['pt-BR', 'en'] as const,
  defaultLocale: 'pt-BR',

  supportEmail: 'breno564nascimento@gmail.com',

  /** Seeded automatically on first launch so the app is never empty. */
  autoSeedOnFirstLaunch: true,
} as const;

export type SupportedLocale = (typeof APP_CONFIG.supportedLocales)[number];
