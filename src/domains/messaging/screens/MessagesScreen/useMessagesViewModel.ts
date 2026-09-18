import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@src/core/logger';
import { requestNotificationPermission } from '@src/core/permissions';
import { invalidatePermissions } from '@src/domains/geofencing/queries/invalidate';
import { usePermissions } from '@src/domains/geofencing/queries/usePermissions';
import { useToast } from '@src/lib/toast';

import {
  invalidateMessagingData,
  useMessagePlan,
  useMessagingSnapshot,
  useReceipts,
  type PlanEntry,
} from '@src/domains/messaging/queries/useMessagingState';
import { drainReceipts, readDeliveryEndpoint } from '@src/domains/messaging/services/receiptSender';
import { enrol, resetEnrolment } from '@src/domains/messaging/services/scheduleRepository';
import { cancelAllMessages, reconcileSchedule } from '@src/domains/messaging/services/scheduler';
import type { DeliveryReceipt, MessagingSnapshot } from '@src/domains/messaging/types';

export interface MessagesViewModel {
  snapshot: MessagingSnapshot | undefined;
  plan: PlanEntry[];
  receipts: DeliveryReceipt[];
  endpoint: string;
  busy: boolean;
  notificationsBlocked: boolean;
  signUp: () => Promise<void>;
  reset: () => Promise<void>;
  sync: () => Promise<void>;
}

export function useMessagesViewModel(): MessagesViewModel {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data: snapshot } = useMessagingSnapshot();
  const { data: plan = [] } = useMessagePlan();
  const { data: receipts = [] } = useReceipts();
  const { data: permissions } = usePermissions();

  const notificationsBlocked =
    (snapshot?.enrolledAt ?? null) !== null && permissions?.notifications !== 'granted';

  const signUp = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await requestNotificationPermission();
      invalidatePermissions();

      if (permission !== 'granted') {
        toast.show({ message: t('messages.permissionDenied'), type: 'error' });
        return;
      }

      enrol();
      const summary = await reconcileSchedule();
      invalidateMessagingData();
      toast.show({ message: t('messages.enrolled', { total: summary.scheduled }), type: 'success' });
    } catch (error) {
      logger.error('messages', 'signUp failed', { error: String(error) });
      toast.show({ message: t('common.unexpectedError'), type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      await cancelAllMessages();
      resetEnrolment();
      invalidateMessagingData();
      toast.show({ message: t('messages.reset') });
    } catch (error) {
      logger.error('messages', 'reset failed', { error: String(error) });
      toast.show({ message: t('common.unexpectedError'), type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  const sync = useCallback(async () => {
    setBusy(true);
    try {
      const summary = await reconcileSchedule();
      const drained = await drainReceipts();
      invalidateMessagingData();
      toast.show({
        message: t('messages.synced', {
          scheduled: summary.scheduled,
          confirmed: drained.confirmed,
        }),
      });
    } catch (error) {
      logger.error('messages', 'sync failed', { error: String(error) });
      toast.show({ message: t('common.unexpectedError'), type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  return {
    snapshot,
    plan,
    receipts,
    endpoint: readDeliveryEndpoint(),
    busy,
    notificationsBlocked,
    signUp,
    reset,
    sync,
  };
}
