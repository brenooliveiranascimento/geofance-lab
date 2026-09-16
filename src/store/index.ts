import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  createOnboardingSlice,
  type OnboardingSlice,
} from '@src/domains/onboarding/store/onboardingSlice';
import {
  createSettingsSlice,
  type SettingsSlice,
} from '@src/domains/settings/store/settingsSlice';
import { mmkvStorage } from '@src/lib/storage/mmkv';

export type StoreState = SettingsSlice & OnboardingSlice;

/**
 * UI preferences only.
 *
 * Everything the background tasks touch — places, presence, events, the message
 * schedule — lives in SQLite instead. MMKV is fast and synchronous, but the
 * headless task context is the least forgiving place this app runs and SQLite
 * gives us transactions there. The split is deliberate, not incidental.
 */
export const useStore = create<StoreState>()(
  persist(
    (...args) => ({
      ...createSettingsSlice(...args),
      ...createOnboardingSlice(...args),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        onboardingCompleted: state.onboardingCompleted,
        language: state.language,
        colorScheme: state.colorScheme,
      }),
    },
  ),
);
