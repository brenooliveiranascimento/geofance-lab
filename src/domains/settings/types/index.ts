import { APP_CONFIG, type SupportedLocale } from '@src/config/app';

export type LanguageCode = SupportedLocale;

export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = APP_CONFIG.supportedLocales;
