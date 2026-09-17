import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

import { resetDatabase } from '@src/core/db';
import { clearLog } from '@src/core/logger';
import {
  needsBatteryOptimizationOptOut,
  requestMonitoringPermissions,
  requestNotificationPermission,
  type MonitoringPermissions,
} from '@src/core/permissions';
import { APP_CONFIG } from '@src/config/app';
import {
  invalidateGeofencingData,
  invalidatePermissions,
} from '@src/domains/geofencing/queries/invalidate';
import { usePermissions } from '@src/domains/geofencing/queries/usePermissions';
import { clearEvents } from '@src/domains/geofencing/services/eventRepository';
import { refreshNotificationChannel } from '@src/domains/geofencing/services/notifier';
import { stopMonitoring } from '@src/domains/geofencing/services/monitorService';
import {
  cancelAllMessages,
  drainReceipts,
  parseEndpoint,
  probeDeliveryEndpoint,
  readDeliveryEndpoint,
  rescheduleForLocale,
  writeDeliveryEndpoint,
} from '@src/domains/messaging';
import { invalidateMessagingData } from '@src/domains/messaging/queries/useMessagingState';
import { useToast } from '@src/lib/toast';
import { useStore } from '@src/store';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@src/domains/settings/types';
import i18n from '@src/i18n';

export interface SettingsViewModel {
  language: LanguageCode;
  languages: readonly LanguageCode[];
  setLanguage: (code: LanguageCode) => void;
  permissions: MonitoringPermissions | undefined;
  requestPermissions: () => Promise<void>;
  requestNotifications: () => Promise<void>;
  openSystemSettings: () => void;
  showBatteryOptOut: boolean;
  openBatterySettings: () => Promise<void>;
  appVersion: string;
  deliveryEndpoint: string;
  deliveryDraft: string;
  setDeliveryDraft: (value: string) => void;
  deliveryState: DeliveryState;
  deliveryDetail: string | null;
  saveDelivery: () => void;
  testDelivery: () => Promise<void>;
  busy: boolean;
  clearEventLog: () => void;
  resetEverything: () => void;
  openHistory: () => void;
  openSimulator: () => void;
}

export type DeliveryState = 'idle' | 'testing' | 'ok' | 'failed' | 'invalid';

export function useSettingsViewModel(): SettingsViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const setOnboardingCompleted = useStore((state) => state.setOnboardingCompleted);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [deliveryEndpoint, setDeliveryEndpoint] = useState(() => readDeliveryEndpoint());
  const [deliveryDraft, setDeliveryDraft] = useState(deliveryEndpoint);
  const [deliveryState, setDeliveryState] = useState<DeliveryState>('idle');
  const [deliveryDetail, setDeliveryDetail] = useState<string | null>(null);

  const storedLanguage = useStore((s) => s.language);
  const setStoredLanguage = useStore((s) => s.setLanguage);
  const { data: permissions } = usePermissions();

  const language = (storedLanguage ?? (i18n.language as LanguageCode)) ?? APP_CONFIG.defaultLocale;

  const setLanguage = useCallback(
    (code: LanguageCode) => {
      setStoredLanguage(code);
      void i18n.changeLanguage(code).then(async () => {
        await Promise.all([rescheduleForLocale(), refreshNotificationChannel()]);
        invalidateMessagingData();
      });
    },
    [setStoredLanguage],
  );

  const requestPermissions = useCallback(async () => {
    await requestMonitoringPermissions();
    invalidatePermissions();
  }, []);

  const requestNotifications = useCallback(async () => {
    await requestNotificationPermission();
    invalidatePermissions();
  }, []);

  const openBatterySettings = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
      );
    } catch {
      void Linking.openSettings();
    }
  }, []);


  const clearEventLog = useCallback(() => {
    clearEvents();
    clearLog();
    invalidateGeofencingData();
    toast.show({ message: t('events.cleared') });
  }, [t, toast]);

  const resetEverything = useCallback(() => {
    Alert.alert(t('settings.reset.title'), t('settings.reset.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.reset.confirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await stopMonitoring();
              await cancelAllMessages();
              resetDatabase();
              invalidateGeofencingData();
              invalidateMessagingData();
              setOnboardingCompleted(false);
              toast.show({ message: t('settings.reset.done'), type: 'success' });
              router.replace('/(onboarding)');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }, [router, setOnboardingCompleted, t, toast]);

  const saveDelivery = useCallback(() => {
    const parsed = parseEndpoint(deliveryDraft);
    if (!parsed.valid) {
      setDeliveryState('invalid');
      return;
    }

    writeDeliveryEndpoint(parsed.value);
    setDeliveryEndpoint(parsed.value);
    setDeliveryDraft(parsed.value);
    setDeliveryState('idle');
    toast.show({
      message: parsed.value ? t('settings.delivery.saved') : t('settings.delivery.cleared'),
      type: 'success',
    });
    if (parsed.value) void drainReceipts();
  }, [deliveryDraft, t, toast]);

  const testDelivery = useCallback(async () => {
    const parsed = parseEndpoint(deliveryDraft);
    if (!parsed.valid || !parsed.value) {
      setDeliveryState('invalid');
      return;
    }

    setDeliveryState('testing');
    const result = await probeDeliveryEndpoint(parsed.value);
    setDeliveryDetail(result.ok ? null : (result.status ? `HTTP ${result.status}` : (result.error ?? null)));
    setDeliveryState(result.ok ? 'ok' : 'failed');
  }, [deliveryDraft]);

  return {
    language,
    languages: SUPPORTED_LANGUAGES,
    setLanguage,
    permissions,
    requestPermissions,
    requestNotifications,
    openSystemSettings: () => void Linking.openSettings(),
    showBatteryOptOut: needsBatteryOptimizationOptOut,
    openBatterySettings,
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    deliveryEndpoint,
    deliveryDraft,
    setDeliveryDraft: (value) => {
      setDeliveryDraft(value);
      setDeliveryState('idle');
    },
    deliveryState,
    deliveryDetail,
    saveDelivery,
    testDelivery,
    busy,
    clearEventLog,
    resetEverything,
    openHistory: () => router.push('/history'),
    openSimulator: () => router.push('/simulator'),
  };
}
