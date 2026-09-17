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
import { stopMonitoring } from '@src/domains/geofencing/services/monitorService';
import { DELIVERY_ENDPOINT } from '@src/domains/messaging';
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
  busy: boolean;
  clearEventLog: () => void;
  resetEverything: () => void;
  openDiagnostics: () => void;
  openSimulator: () => void;
}

export function useSettingsViewModel(): SettingsViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const storedLanguage = useStore((s) => s.language);
  const setStoredLanguage = useStore((s) => s.setLanguage);
  const { data: permissions } = usePermissions();

  const language = (storedLanguage ?? (i18n.language as LanguageCode)) ?? APP_CONFIG.defaultLocale;

  const setLanguage = useCallback(
    (code: LanguageCode) => {
      setStoredLanguage(code);
      void i18n.changeLanguage(code);
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
              resetDatabase();
              invalidateGeofencingData();
              invalidateMessagingData();
              toast.show({ message: t('settings.reset.done'), type: 'success' });
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }, [t, toast]);

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
    deliveryEndpoint: DELIVERY_ENDPOINT,
    busy,
    clearEventLog,
    resetEverything,
    openDiagnostics: () => router.push('/diagnostics'),
    openSimulator: () => router.push('/simulator'),
  };
}
