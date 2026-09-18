import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';

import { resetDatabase } from '@src/core/db';
import { setOnboardingCompleted } from '@src/domains/onboarding/services/onboardingFlag';
import {
  requestMonitoringPermissions,
  requestNotificationPermission,
  type MonitoringPermissions,
} from '@src/core/permissions';
import {
  invalidateGeofencingData,
  invalidatePermissions,
} from '@src/domains/geofencing/queries/invalidate';
import { usePermissions } from '@src/domains/geofencing/queries/usePermissions';
import { stopMonitoring } from '@src/domains/geofencing/services/monitorService';
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
  appVersion: string;
  deliveryDraft: string;
  setDeliveryDraft: (value: string) => void;
  saveDelivery: () => void;
  busy: boolean;
  resetEverything: () => void;
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
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    deliveryDraft,
    setDeliveryDraft,
    saveDelivery,
    busy,
    resetEverything,
  };
}
