import type { IconSymbolName } from '@src/components/ui/icon-symbol';

/** Onboarding is permission priming: explain, then ask. */
export interface OnboardingStep {
  key: 'welcome' | 'how' | 'location' | 'notifications';
  /** Constrained to the mapped symbols so Android never renders a blank icon. */
  icon: IconSymbolName;
  title: string;
  body: string;
  bullets?: string[];
  /** Steps that ask the OS for something rather than just advancing. */
  action?: 'location' | 'notifications';
}
