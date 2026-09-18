import { Redirect } from 'expo-router';
import React from 'react';

import { isOnboardingCompleted } from '@src/domains/onboarding/services/onboardingFlag';

export default function Index(): React.JSX.Element {
  return <Redirect href={isOnboardingCompleted() ? '/(tabs)' : '/(onboarding)'} />;
}
