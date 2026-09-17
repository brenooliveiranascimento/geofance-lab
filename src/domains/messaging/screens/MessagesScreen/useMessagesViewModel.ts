import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { requestNotificationPermission, type PermissionState } from '@src/core/permissions';
import { useToast } from '@src/lib/toast';

import {
  invalidateMessagingData,
  useMessagePlan,
  useMessagingSnapshot,
  useReceipts,
  type PlanEntry,
} from '../../queries/useMessagingState';
import {
  drainReceipts,
  readDeliveryEndpoint,
  retryExhaustedReceipts,
} from '../../services/receiptSender';
import { enrol, resetEnrolment } from '../../services/scheduleRepository';
import { cancelAllMessages, reconcileSchedule } from '../../services/scheduler';
import type { DeliveryReceipt, MessagingSnapshot } from '../../types';

export interface MessagesViewModel {
  snapshot: MessagingSnapshot | undefined;
  plan: PlanEntry[];
  receipts: DeliveryReceipt[];
  endpoint: string;
  busy: boolean;
  notificationPermission: PermissionState | null;
  signUp: () => Promise<void>;
  reset: () => Promise<void>;
  sync: () => Promise<void>;
  retryReceipts: () => Promise<void>;
}

export function useMessagesViewModel(): MessagesViewModel {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<PermissionState | null>(null);

  const { data: snapshot } = useMessagingSnapshot();
  const { data: plan = [] } = useMessagePlan();
  const { data: receipts = [] } = useReceipts();

  const signUp = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await requestNotificationPermission();
      setNotificationPermission(permission);

      if (permission !== 'granted') {
        toast.show({ message: t('messages.permissionDenied'), type: 'error' });
        return;
      }

      enrol();
      const summary = await reconcileSchedule();
      invalidateMessagingData();
      toast.show({ message: t('messages.enrolled', { total: summary.scheduled }), type: 'success' });
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
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  const retryReceipts = useCallback(async () => {
    setBusy(true);
    try {
      const requeued = retryExhaustedReceipts();
      const drained = await drainReceipts();
      invalidateMessagingData();
      toast.show({ message: t('messages.retried', { requeued, confirmed: drained.confirmed }) });
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
    notificationPermission,
    signUp,
    reset,
    sync,
    retryReceipts,
  };
}
