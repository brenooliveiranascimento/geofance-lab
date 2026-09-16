import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@src/domains/settings/types';
import { mmkvStorage } from '@src/lib/storage/mmkv';

/**
 * Portuguese is the default; English mirrors it key for key.
 *
 * Two conventions worth knowing before adding strings:
 *
 *   1. Interpolation variables are lowercase or camelCase. `count` in
 *      particular is reserved by i18next for pluralisation — a key that takes a
 *      `count` needs explicit `_one` / `_other` forms, so plain numeric
 *      placeholders are named `total`, `regions`, `vertices` and so on instead.
 *   2. Every key must exist in both locales. `node scripts/check-i18n.mjs`
 *      verifies that, and that the code asks for nothing the bundles lack — a
 *      missing key renders as the key itself, which reads like a label until
 *      somebody looks closely.
 */

function readPersistedLanguage(): LanguageCode | null {
  try {
    const raw = mmkvStorage.getItem('app-store');
    // Our MMKV implementation is synchronous (returns string | null), but the
    // StateStorage type is generic over async — guard at runtime.
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

// Map the device locale to a language we actually ship. This template ships
// `en` and `pt-BR`. The device reports a 2-letter language code (e.g. 'pt'),
// so 'pt' is mapped to our regional 'pt-BR' resource. Any unsupported language
// (e.g. German) falls back to English rather than leaving i18n.language pointing
// at a code with no resources — otherwise the UI desyncs: translated strings
// resolve via fallbackLng while any code that reads i18n.language sees the
// unsupported code. (App Store review flagged this as "language was not
// synchronized" on an English iPad.)
function resolveDeviceLanguage(): LanguageCode {
  const code = Localization.getLocales()[0]?.languageCode?.slice(0, 2).toLowerCase();
  const mapped = code === 'pt' ? 'pt-BR' : code;
  if (mapped && (SUPPORTED_LANGUAGES as readonly string[]).includes(mapped)) {
    return mapped as LanguageCode;
  }
  return 'en';
}

const initialLanguage: LanguageCode = readPersistedLanguage() ?? resolveDeviceLanguage();

// `use` here is i18next's plugin registration, not the React hook the rule
// is guarding against.
// eslint-disable-next-line import/no-named-as-default-member
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
