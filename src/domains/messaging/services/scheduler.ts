import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { transaction } from '@src/core/db';
import i18n from '@src/i18n';
import { logger } from '@src/core/logger';

import { countPendingReceipts, drainReceipts, enqueueReceipt, receiptKeyFor } from '@src/domains/messaging/services/receiptSender';
import {
  clearSchedule,
  countByState,
  listSchedule,
  markDelivered,
  markScheduled,
  nextScheduled,
  readEnrolledAt,
} from '@src/domains/messaging/services/scheduleRepository';
import { buildPlan, diffSchedule, slotKey, type PlannerContent } from '@src/domains/messaging/services/sequencePlanner';
import { dailyMessages, onboardingMessages, subtitleFormatter } from '@src/domains/messaging/content/messages';
import { MESSAGING_CONFIG } from '@src/domains/messaging/config';
import type { MessagingSnapshot, PlannedMessage, SequenceId } from '@src/domains/messaging/types';

const TAG = 'messaging';

export const MESSAGES_CHANNEL_ID = 'daily-messages';

const content = (): PlannerContent => ({
  onboarding: onboardingMessages(),
  daily: dailyMessages(),
  subtitle: subtitleFormatter,
});

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
      name: i18n.t('messages.channel'),
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    channelReady = true;
  } catch (error) {
    logger.error(TAG, 'failed to create channel', { error: String(error) });
  }
}

function contentFor(message: PlannedMessage): Notifications.NotificationContentInput {
  return {
    title: message.title,
    subtitle: message.subtitle,
    body: message.body,
    data: { sequence: message.sequence, position: message.position, messageId: message.messageId },
  };
}

export interface ReconcileSummary {
  scheduled: number;
  delivered: number;
}

export interface ReconcileOptions {
  now?: number;
}

let queue: Promise<unknown> = Promise.resolve();

export function reconcileSchedule(options: ReconcileOptions = {}): Promise<ReconcileSummary> {
  const run = queue.then(() => runReconcile(options));
  queue = run.catch(() => undefined);
  return run;
}

async function runReconcile({ now = Date.now() }: ReconcileOptions): Promise<ReconcileSummary> {
  const idle: ReconcileSummary = { scheduled: 0, delivered: 0 };

  const enrolledAt = readEnrolledAt();
  if (enrolledAt === null) return idle;

  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    logger.warn(TAG, 'notifications are not permitted, holding the schedule');
    return idle;
  }

  await ensureChannel();

  const plan = buildPlan(enrolledAt, MESSAGING_CONFIG, content());
  const existing = listSchedule();

  let liveIds: Set<string> | null = null;
  try {
    const live = await Notifications.getAllScheduledNotificationsAsync();
    liveIds = new Set(live.map((request) => request.identifier));
  } catch (error) {
    logger.warn(TAG, 'could not read queued notifications', { error: String(error) });
  }

  const diff = diffSchedule(plan, existing, {
    now,
    horizon: MESSAGING_CONFIG.scheduleHorizon,
    liveNotificationIds: liveIds,
  });

  for (const row of diff.toMarkDelivered) {
    const planned = plan.find((m) => m.sequence === row.sequence && m.position === row.position);
    recordDelivery(row.sequence, row.position, row.messageId, planned?.subtitle ?? '', row.scheduledFor);
  }

  let scheduled = 0;
  for (const message of diff.toSchedule) {
    const key = slotKey(message.sequence, message.position);
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        identifier: key,
        content: contentFor(message),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(message.scheduledFor),
          ...(Platform.OS === 'android' ? { channelId: MESSAGES_CHANNEL_ID } : {}),
        },
      });
      markScheduled(message.sequence, message.position, message.messageId, message.scheduledFor, identifier);
      scheduled += 1;
    } catch (error) {
      logger.error(TAG, 'failed to schedule', { key, error: String(error) });
    }
  }

  const summary = { scheduled, delivered: diff.toMarkDelivered.length };
  if (scheduled || summary.delivered) logger.info(TAG, 'schedule reconciled', summary);
  return summary;
}

export function recordDelivery(
  sequence: SequenceId,
  position: number,
  messageId: string,
  subtitle: string,
  deliveredAt: number,
): boolean {
  return transaction((db) => {
    const isNew = markDelivered(sequence, position, deliveredAt, db);
    if (!isNew) return false;

    enqueueReceipt(
      {
        idempotencyKey: receiptKeyFor(readEnrolledAt() ?? 0, sequence, position),
        sequence,
        position,
        messageId,
        subtitle,
        deliveredAt,
      },
      db,
    );
    return true;
  });
}

export function handleNotificationReceived(notification: Notifications.Notification): void {
  try {
    recordObservedDelivery(notification);
  } catch (error) {
    logger.error(TAG, 'could not record an observed delivery', { error: String(error) });
  }
}

function recordObservedDelivery(notification: Notifications.Notification): void {
  const data = notification.request.content.data as
    | { sequence?: SequenceId; position?: number; messageId?: string }
    | undefined;

  if (!data?.sequence || typeof data.position !== 'number') return;

  const subtitle = notification.request.content.subtitle ?? '';

  const recorded = recordDelivery(
    data.sequence,
    data.position,
    data.messageId ?? '',
    subtitle,
    Date.now(),
  );

  if (recorded) {
    logger.info(TAG, 'delivery observed in-app', {
      key: slotKey(data.sequence, data.position),
    });
    void drainReceipts();
  }
}

export function readMessagingSnapshot(): MessagingSnapshot {
  return {
    enrolledAt: readEnrolledAt(),
    scheduled: countByState('scheduled'),
    delivered: countByState('delivered'),
    pendingReceipts: countPendingReceipts(),
    nextMessage: nextScheduled(),
  };
}

export function readPlanWithState(): {
  message: PlannedMessage;
  state: string;
  deliveredAt: number | null;
}[] {
  const enrolledAt = readEnrolledAt();
  if (enrolledAt === null) return [];

  const rows = new Map(listSchedule().map((row) => [slotKey(row.sequence, row.position), row]));

  return buildPlan(enrolledAt, MESSAGING_CONFIG, content()).map((message) => {
    const row = rows.get(slotKey(message.sequence, message.position));
    return {
      message,
      state: row?.state ?? 'pending',
      deliveredAt: row?.deliveredAt ?? null,
    };
  });
}

export async function cancelAllMessages(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    logger.warn(TAG, 'could not clear the queued notifications', { error: String(error) });
  }
  clearSchedule();
  logger.info(TAG, 'schedule cleared');
}
