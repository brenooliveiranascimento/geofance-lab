import { APP_CONFIG, type SupportedLocale } from '@src/config/app';

export type ColorSchemePreference = 'light' | 'dark' | 'system';

// Language codes the app ships with, derived from the locales configured at app
// creation. Keep the settings language picker in sync with the bundled i18n
// resources automatically.
export type LanguageCode = SupportedLocale;

export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = APP_CONFIG.supportedLocales;
