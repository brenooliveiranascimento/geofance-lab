import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '@src/i18n';
import { logger } from '@src/core/logger';

import { markNotified } from '@src/domains/geofencing/services/eventRepository';
import type { GeofenceEvent } from '@src/domains/geofencing/types';

export const GEOFENCE_CHANNEL_ID = 'geofence-events';

let channelReady = false;

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;

  try {
    await Notifications.setNotificationChannelAsync(GEOFENCE_CHANNEL_ID, {
      name: i18n.t('notifications.channel'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    channelReady = true;
  } catch (error) {
    logger.error('notifier', 'failed to create channel', { error: String(error) });
  }
}

export async function refreshNotificationChannel(): Promise<void> {
  channelReady = false;
  await ensureNotificationChannel();
}

function describe(event: GeofenceEvent): { title: string; body: string } {
  const entering = event.kind === 'company_enter' || event.kind === 'room_enter';

  if (event.kind === 'room_enter' || event.kind === 'room_exit') {
    return {
      title: i18n.t(entering ? 'notifications.room.enter' : 'notifications.room.exit', {
        name: event.roomName ?? '',
      }),
      body: event.companyName,
    };
  }

  return {
    title: i18n.t(entering ? 'notifications.company.enter' : 'notifications.company.exit', {
      name: event.companyName,
    }),
    body:
      event.distance === null
        ? i18n.t('notifications.body.perimeter')
        : i18n.t('notifications.body.distance', { meters: Math.round(event.distance) }),
  };
}

export async function notifyEvents(events: readonly GeofenceEvent[]): Promise<void> {
  if (events.length === 0) return;

  await ensureNotificationChannel();

  const delivered: number[] = [];

  for (const event of events) {
    const { title, body } = describe(event);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            kind: event.kind,
            companyId: event.companyId,
            roomId: event.roomId,
            idempotencyKey: event.idempotencyKey,
          },
        },
        trigger: Platform.OS === 'android' ? { channelId: GEOFENCE_CHANNEL_ID } : null,
      });
      if (event.id !== undefined) delivered.push(event.id);
    } catch (error) {
      logger.error('notifier', 'failed to post notification', {
        key: event.idempotencyKey,
        error: String(error),
      });
    }
  }

  if (delivered.length > 0) {
    markNotified(delivered);
  }
}
