import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@src/core/logger';

import { markNotified } from './eventRepository';
import type { GeofenceEvent } from '../types';

export const GEOFENCE_CHANNEL_ID = 'geofence-events';

let channelReady = false;

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;

  try {
    await Notifications.setNotificationChannelAsync(GEOFENCE_CHANNEL_ID, {
      name: 'Entradas e saídas',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    channelReady = true;
  } catch (error) {
    logger.error('notifier', 'failed to create channel', { error: String(error) });
  }
}

function describe(event: GeofenceEvent): { title: string; body: string } {
  const entering = event.kind === 'place_enter' || event.kind === 'room_enter';

  if (event.kind === 'room_enter' || event.kind === 'room_exit') {
    return {
      title: entering ? `Entrou em ${event.roomName}` : `Saiu de ${event.roomName}`,
      body: event.placeName,
    };
  }

  return {
    title: entering ? `Chegou em ${event.placeName}` : `Saiu de ${event.placeName}`,
    body:
      event.distance === null
        ? 'Perímetro monitorado'
        : `A ${Math.round(event.distance)} m do centro`,
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
            placeId: event.placeId,
            roomId: event.roomId,
            idempotencyKey: event.idempotencyKey,
          },
        },
        trigger: null,
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
