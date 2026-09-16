import React from 'react';
import { OnboardingView } from './OnboardingView';
import { useOnboardingViewModel } from './useOnboardingViewModel';

export function OnboardingScreen(): React.JSX.Element {
  const viewModel = useOnboardingViewModel();
  return <OnboardingView viewModel={viewModel} />;
}
