export const APP_CONFIG = {
  appName: 'Geofence Lab',

  supportedLocales: ['pt-BR', 'en'] as const,
  defaultLocale: 'pt-BR',

  supportEmail: 'breno564nascimento@gmail.com',
} as const;

export type SupportedLocale = (typeof APP_CONFIG.supportedLocales)[number];
