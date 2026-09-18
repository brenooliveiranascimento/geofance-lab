import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ptBR from '@src/i18n/locales/pt-BR.json';

i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR } },
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
