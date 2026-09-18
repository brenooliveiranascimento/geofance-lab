import type { StateCreator } from 'zustand';
import type { LanguageCode } from '@src/domains/settings/types';

export interface SettingsSlice {
  language: LanguageCode | null;
  setLanguage: (lang: LanguageCode) => void;
}

export const createSettingsSlice: StateCreator<SettingsSlice> = (set) => ({
  language: null,
  setLanguage: (lang) => set({ language: lang }),
});
