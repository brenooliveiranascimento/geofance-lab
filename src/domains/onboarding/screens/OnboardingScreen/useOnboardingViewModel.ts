import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  requestMonitoringPermissions,
  requestNotificationPermission,
  type MonitoringPermissions,
} from '@src/core/permissions';
import { invalidatePermissions } from '@src/domains/geofencing/queries/invalidate';
import { useStore } from '@src/store';

import type { OnboardingStep } from '../../types';

export interface OnboardingViewModel {
  steps: OnboardingStep[];
  currentIndex: number;
  step: OnboardingStep;
  isLast: boolean;
  busy: boolean;
  permissions: MonitoringPermissions | null;
  primaryLabel: string;
  advance: () => Promise<void>;
  skip: () => void;
}

/**
 * Permission priming.
 *
 * Both platforms only let you ask once — a denial is permanent until the user
 * goes to Settings — and Android 11+ does not even show a dialog for background
 * location, it opens a settings page with three options. Explaining what is
 * about to be asked, and why, before the prompt appears is the difference
 * between the app working and the app being unable to do anything at all.
 */
export function useOnboardingViewModel(): OnboardingViewModel {
  const { t } = useTranslation();
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<MonitoringPermissions | null>(null);

  const steps = useMemo<OnboardingStep[]>(
    () => [
      {
        key: 'welcome',
        icon: 'location.fill',
        title: t('onboarding.welcome.title'),
        body: t('onboarding.welcome.body'),
      },
      {
        key: 'how',
        icon: 'map.fill',
        title: t('onboarding.how.title'),
        body: t('onboarding.how.body'),
        bullets: [
          t('onboarding.how.bullet1'),
          t('onboarding.how.bullet2'),
          t('onboarding.how.bullet3'),
        ],
      },
      {
        key: 'location',
        icon: 'location.circle.fill',
        title: t('onboarding.location.title'),
        body: t('onboarding.location.body'),
        action: 'location',
      },
      {
        key: 'notifications',
        icon: 'bell.fill',
        title: t('onboarding.notifications.title'),
        body: t('onboarding.notifications.body'),
        action: 'notifications',
      },
    ],
    [t],
  );

  const step = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;

  const finish = useCallback(() => {
    setOnboardingCompleted(true);
    router.replace('/(tabs)');
  }, [setOnboardingCompleted]);

  const advance = useCallback(async () => {
    if (step.action) {
      setBusy(true);
      try {
        if (step.action === 'location') {
          setPermissions(await requestMonitoringPermissions());
        } else {
          await requestNotificationPermission();
        }
        invalidatePermissions();
      } finally {
        setBusy(false);
      }
    }

    if (isLast) finish();
    else setCurrentIndex((index) => index + 1);
  }, [step, isLast, finish]);

  return {
    steps,
    currentIndex,
    step,
    isLast,
    busy,
    permissions,
    primaryLabel: step.action
      ? t(`onboarding.${step.key}.action`)
      : isLast
        ? t('onboarding.finish')
        : t('common.next'),
    advance,
    skip: finish,
  };
}
