import type { StateCreator } from 'zustand';
import type { ColorSchemePreference, LanguageCode } from '@src/domains/settings/types';

export interface SettingsSlice {
  colorScheme: ColorSchemePreference;
  language: LanguageCode | null;
  setColorScheme: (scheme: ColorSchemePreference) => void;
  setLanguage: (lang: LanguageCode) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  colorScheme: 'system',
  language: null,
  setColorScheme: (scheme) => set({ colorScheme: scheme }),
  setLanguage: (lang) => set({ language: lang }),
});
