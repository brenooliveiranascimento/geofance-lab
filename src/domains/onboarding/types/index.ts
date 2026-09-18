import type { IconName } from '@src/components/atoms';

export interface OnboardingStep {
  key: 'welcome' | 'how' | 'location' | 'notifications' | 'company';
  icon: IconName;
  title: string;
  body: string;
  bullets?: string[];
  action?: 'location' | 'notifications' | 'company';
}
