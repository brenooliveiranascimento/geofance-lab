import type { IconSymbolName } from '@src/components/ui/icon-symbol';

export interface OnboardingStep {
  key: 'welcome' | 'how' | 'location' | 'notifications';
  icon: IconSymbolName;
  title: string;
  body: string;
  bullets?: string[];
  action?: 'location' | 'notifications';
}
