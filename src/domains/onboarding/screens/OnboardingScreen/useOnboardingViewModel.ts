import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  requestMonitoringPermissions,
  requestNotificationPermission,
  type MonitoringPermissions,
} from '@src/core/permissions';
import { logger } from '@src/core/logger';
import { invalidatePermissions } from '@src/domains/geofencing/queries/invalidate';
import { useToast } from '@src/lib/toast';
import { useStore } from '@src/store';

import type { OnboardingStep } from '@src/domains/onboarding/types';

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

export function useOnboardingViewModel(): OnboardingViewModel {
  const { t } = useTranslation();
  const toast = useToast();
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [permissions, setPermissions] = useState<MonitoringPermissions | null>(null);

  const steps = useMemo<OnboardingStep[]>(
    () => [
      {
        key: 'welcome',
        icon: 'building.2.fill',
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
      {
        key: 'company',
        icon: 'mappin.and.ellipse',
        title: t('onboarding.company.title'),
        body: t('onboarding.company.body'),
        bullets: [
          t('onboarding.company.bullet1'),
          t('onboarding.company.bullet2'),
          t('onboarding.company.bullet3'),
        ],
        action: 'company',
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
    if (step.action === 'company') {
      router.replace('/companies/new');
      return;
    }

    if (step.action) {
      setBusy(true);
      try {
        if (step.action === 'location') {
          setPermissions(await requestMonitoringPermissions());
        } else {
          await requestNotificationPermission();
        }
        invalidatePermissions();
      } catch (error) {
      logger.error('onboarding', 'advance failed', { error: String(error) });
      toast.show({ message: t('common.unexpectedError'), type: 'error' });
    } finally {
        setBusy(false);
      }
    }

    if (isLast) finish();
    else setCurrentIndex((index) => index + 1);
  }, [step, isLast, finish, t, toast]);

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
