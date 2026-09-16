import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { transaction } from '@src/core/db';
import { logger } from '@src/core/logger';

import { countPendingReceipts, enqueueReceipt } from './receiptSender';
import {
  clearSchedule,
  countByState,
  listSchedule,
  markCancelled,
  markDelivered,
  markFailed,
  markScheduled,
  nextScheduled,
  readEnrolledAt,
  writeLastReconciledAt,
} from './scheduleRepository';
import { buildPlan, diffSchedule, slotKey, type PlannerContent } from './sequencePlanner';
import { DAILY_MESSAGES, ONBOARDING_MESSAGES } from '../content/messages';
import { MESSAGING_CONFIG } from '../config';
import type { MessagingSnapshot, PlannedMessage, SequenceId } from '../types';

const TAG = 'messaging';

export const MESSAGES_CHANNEL_ID = 'daily-messages';

const CONTENT: PlannerContent = {
  onboarding: ONBOARDING_MESSAGES,
  daily: DAILY_MESSAGES,
};

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
      name: 'Mensagens',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    channelReady = true;
  } catch (error) {
    logger.error(TAG, 'failed to create channel', { error: String(error) });
  }
}

/**
 * Builds the notification content for a slot.
 *
 * `subtitle` is an iOS-only field in expo-notifications — Android's equivalent
 * (`setSubText`) is not exposed — so on Android the same string is promoted to
 * the first line of the body. The requirement is that "Semana X; Mensagem Y de
 * Z" is visible on the notification, and this is how it stays visible on both
 * platforms without pretending the field exists where it does not.
 */
function contentFor(message: PlannedMessage): Notifications.NotificationContentInput {
  if (Platform.OS === 'ios') {
    return {
      title: message.title,
      subtitle: message.subtitle,
      body: message.body,
      data: { sequence: message.sequence, position: message.position, messageId: message.messageId },
    };
  }

  return {
    title: message.title,
    body: `${message.subtitle}\n${message.body}`,
    data: { sequence: message.sequence, position: message.position, messageId: message.messageId },
  };
}

export interface ReconcileSummary {
  scheduled: number;
  cancelled: number;
  delivered: number;
  skipped: boolean;
}

/**
 * Brings the OS queue in line with the plan.
 *
 * Idempotent, and that is the whole design: instead of "schedule the next one
 * when this one fires" — which loses the thread the moment a delivery is missed
 * — it recomputes what *should* be queued and fixes only the difference. Running
 * it twice changes nothing; running it after a week offline catches up cleanly.
 *
 * Notification identifiers are the slot keys, so the OS itself refuses to hold
 * two notifications for the same message: re-scheduling a slot replaces it.
 */
export async function reconcileSchedule(now = Date.now()): Promise<ReconcileSummary> {
  const enrolledAt = readEnrolledAt();
  if (enrolledAt === null) {
    return { scheduled: 0, cancelled: 0, delivered: 0, skipped: true };
  }

  await ensureChannel();

  const plan = buildPlan(enrolledAt, MESSAGING_CONFIG, CONTENT);
  const existing = listSchedule();

  // Ask the OS what it still holds. A row can claim to be queued while the
  // notification is gone — reinstall, restored backup, or the user clearing
  // everything — and only the OS can tell us.
  let liveIds: Set<string> | null = null;
  try {
    const live = await Notifications.getAllScheduledNotificationsAsync();
    liveIds = new Set(live.map((request) => request.identifier));
  } catch (error) {
    // Without the cross-check the diff simply trusts the local rows, which is
    // the safe direction: it may miss a lost notification, never duplicate one.
    logger.warn(TAG, 'could not read queued notifications', { error: String(error) });
  }

  const diff = diffSchedule(plan, existing, {
    now,
    horizon: MESSAGING_CONFIG.scheduleHorizon,
    liveNotificationIds: liveIds,
  });

  for (const row of diff.toCancel) {
    const key = slotKey(row.sequence, row.position);
    try {
      await Notifications.cancelScheduledNotificationAsync(key);
    } catch {
      // Already gone — the desired end state either way.
    }
    markCancelled(row.sequence, row.position);
  }

  // Deliveries observed only by their time having passed. The in-app listener
  // reports the rest as they arrive; `markDelivered` ignores whichever comes
  // second, so a message never produces two receipts.
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
      markFailed(message.sequence, message.position, String(error));
    }
  }

  writeLastReconciledAt(now);

  const summary = {
    scheduled,
    cancelled: diff.toCancel.length,
    delivered: diff.toMarkDelivered.length,
    skipped: false,
  };
  if (scheduled || diff.toCancel.length || diff.toMarkDelivered.length) {
    logger.info(TAG, 'schedule reconciled', summary);
  }
  return summary;
}

/**
 * Marks a slot delivered and queues its confirmation, in one transaction.
 *
 * Both halves or neither: a delivery recorded without its receipt would never be
 * confirmed, and a receipt without the delivery would be sent again on the next
 * pass.
 */
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
        idempotencyKey: slotKey(sequence, position),
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

/** Wired to `addNotificationReceivedListener` while the app is running. */
export function handleNotificationReceived(notification: Notifications.Notification): void {
  const data = notification.request.content.data as
    | { sequence?: SequenceId; position?: number; messageId?: string }
    | undefined;

  if (!data?.sequence || typeof data.position !== 'number') return;

  const subtitle =
    notification.request.content.subtitle ??
    (notification.request.content.body ?? '').split('\n')[0];

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
  }
}

export function readMessagingSnapshot(): MessagingSnapshot {
  const rows = listSchedule();
  return {
    enrolledAt: readEnrolledAt(),
    scheduled: countByState('scheduled'),
    delivered: countByState('delivered'),
    total: rows.length,
    pendingReceipts: countPendingReceipts(),
    nextMessage: nextScheduled(),
  };
}

/** Full plan with live state attached, for the Messages screen. */
export function readPlanWithState(): {
  message: PlannedMessage;
  state: string;
  deliveredAt: number | null;
}[] {
  const enrolledAt = readEnrolledAt();
  if (enrolledAt === null) return [];

  const rows = new Map(listSchedule().map((row) => [slotKey(row.sequence, row.position), row]));

  return buildPlan(enrolledAt, MESSAGING_CONFIG, CONTENT).map((message) => {
    const row = rows.get(slotKey(message.sequence, message.position));
    return {
      message,
      state: row?.state ?? 'pending',
      deliveredAt: row?.deliveredAt ?? null,
    };
  });
}

/** Cancels everything we queued and forgets the schedule. */
export async function cancelAllMessages(): Promise<void> {
  for (const row of listSchedule()) {
    try {
      await Notifications.cancelScheduledNotificationAsync(slotKey(row.sequence, row.position));
    } catch {
      // Best effort.
    }
  }
  clearSchedule();
  logger.info(TAG, 'schedule cleared');
}
