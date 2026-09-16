import type { StateCreator } from 'zustand';
import type { ColorSchemePreference, LanguageCode } from '@src/domains/settings/types';

export interface SettingsSlice {
  colorScheme: ColorSchemePreference;
  // null = follow the device locale (default until the user picks one).
  // Persisted by the store's partialize so the choice survives restarts.
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
