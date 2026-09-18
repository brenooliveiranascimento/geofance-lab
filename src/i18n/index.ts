import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from '@src/i18n/locales/en.json';
import ptBR from '@src/i18n/locales/pt-BR.json';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@src/domains/settings/types';
import { mmkvStorage } from '@src/lib/storage/mmkv';

function readPersistedLanguage(): LanguageCode | null {
  try {
    const raw = mmkvStorage.getItem('app-store');
    if (typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw) as { state?: { language?: unknown } };
    const lang = parsed.state?.language;
    if (typeof lang === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
      return lang as LanguageCode;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveDeviceLanguage(): LanguageCode {
  const code = Localization.getLocales()[0]?.languageCode?.slice(0, 2).toLowerCase();
  const mapped = code === 'pt' ? 'pt-BR' : code;
  if (mapped && (SUPPORTED_LANGUAGES as readonly string[]).includes(mapped)) {
    return mapped as LanguageCode;
  }
  return 'en';
}

const initialLanguage: LanguageCode = readPersistedLanguage() ?? resolveDeviceLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
