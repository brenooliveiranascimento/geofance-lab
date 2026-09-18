import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

import { resetDatabase } from '@src/core/db';
import { clearLog, logger } from '@src/core/logger';
import { setOnboardingCompleted } from '@src/domains/onboarding/services/onboardingFlag';
import {
  needsBatteryOptimizationOptOut,
  requestMonitoringPermissions,
  requestNotificationPermission,
  type MonitoringPermissions,
} from '@src/core/permissions';
import {
  invalidateGeofencingData,
  invalidatePermissions,
} from '@src/domains/geofencing/queries/invalidate';
import { usePermissions } from '@src/domains/geofencing/queries/usePermissions';
import { loadDemoDataset, removeDemoDataset } from '@src/domains/geofencing/services/demoDataset';
import { clearEvents } from '@src/domains/geofencing/services/eventRepository';
import { refreshMonitoring, stopMonitoring } from '@src/domains/geofencing/services/monitorService';
import {
  cancelAllMessages,
  drainReceipts,
  parseEndpoint,
  readDeliveryEndpoint,
  writeDeliveryEndpoint,
} from '@src/domains/messaging';
import { invalidateMessagingData } from '@src/domains/messaging/queries/useMessagingState';
import { useToast } from '@src/lib/toast';

export interface SettingsViewModel {
  permissions: MonitoringPermissions | undefined;
  requestPermissions: () => Promise<void>;
  requestNotifications: () => Promise<void>;
  openSystemSettings: () => void;
  showBatteryOptOut: boolean;
  openBatterySettings: () => Promise<void>;
  appVersion: string;
  loadDemoDataset: () => Promise<void>;
  removeDemoDataset: () => Promise<void>;
  deliveryDraft: string;
  setDeliveryDraft: (value: string) => void;
  saveDelivery: () => void;
  busy: boolean;
  clearEventLog: () => void;
  resetEverything: () => void;
  openHistory: () => void;
  openSimulator: () => void;
}

export function useSettingsViewModel(): SettingsViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [deliveryDraft, setDeliveryDraft] = useState(() => readDeliveryEndpoint());

  const { data: permissions } = usePermissions();

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

  const loadDemo = useCallback(async () => {
    setBusy(true);
    try {
      const total = loadDemoDataset();
      invalidateGeofencingData();
      await refreshMonitoring();
      toast.show({ message: t('settings.tools.demoLoaded', { total }), type: 'success' });
    } catch (error) {
      logger.error('settings', 'could not load the demo dataset', { error: String(error) });
      toast.show({ message: t('common.unexpectedError'), type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  const removeDemo = useCallback(async () => {
    setBusy(true);
    try {
      const total = removeDemoDataset();
      invalidateGeofencingData();
      await refreshMonitoring();
      toast.show({ message: t('settings.tools.demoRemoved', { total }), type: 'success' });
    } catch (error) {
      logger.error('settings', 'could not remove the demo dataset', { error: String(error) });
      toast.show({ message: t('common.unexpectedError'), type: 'error' });
    } finally {
      setBusy(false);
    }
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
  }, [router, t, toast]);

  const saveDelivery = useCallback(() => {
    const parsed = parseEndpoint(deliveryDraft);
    if (!parsed.valid) {
      toast.show({ message: t('settings.delivery.invalid'), type: 'error' });
      return;
    }

    writeDeliveryEndpoint(parsed.value);
    setDeliveryDraft(parsed.value);
    toast.show({
      message: parsed.value ? t('settings.delivery.saved') : t('settings.delivery.cleared'),
      type: 'success',
    });
    if (parsed.value) void drainReceipts();
  }, [deliveryDraft, t, toast]);

  return {
    permissions,
    requestPermissions,
    requestNotifications,
    openSystemSettings: () => void Linking.openSettings(),
    showBatteryOptOut: needsBatteryOptimizationOptOut,
    openBatterySettings,
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    loadDemoDataset: loadDemo,
    removeDemoDataset: removeDemo,
    deliveryDraft,
    setDeliveryDraft,
    saveDelivery,
    busy,
    clearEventLog,
    resetEverything,
    openHistory: () => router.push('/history'),
    openSimulator: () => router.push('/simulator'),
  };
}
