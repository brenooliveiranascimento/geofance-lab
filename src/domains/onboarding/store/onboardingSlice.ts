import type { StateCreator } from 'zustand';

export interface OnboardingSlice {
  onboardingCompleted: boolean;
  setOnboardingCompleted: (completed: boolean) => void;
}

export const createOnboardingSlice: StateCreator<OnboardingSlice> = (set) => ({
  onboardingCompleted: false,
  setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
});
