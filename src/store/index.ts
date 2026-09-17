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
