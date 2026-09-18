import React from 'react';
import { OnboardingView } from '@src/domains/onboarding/screens/OnboardingScreen/OnboardingView';
import { useOnboardingViewModel } from '@src/domains/onboarding/screens/OnboardingScreen/useOnboardingViewModel';

export function OnboardingScreen(): React.JSX.Element {
  const viewModel = useOnboardingViewModel();
  return <OnboardingView viewModel={viewModel} />;
}
