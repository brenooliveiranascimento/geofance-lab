import { getDatabase, transaction } from '@src/core/db';

import { saveStates } from './stateRepository';
import type { EventSource, GeofenceEvent, GeofenceEventKind, TargetState } from '../types';

interface EventRow {
  id: number;
  idempotency_key: string;
  kind: GeofenceEventKind;
  place_id: string;
  place_name: string;
  room_id: string | null;
  room_name: string | null;
  occurred_at: number;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  distance: number | null;
  source: EventSource;
  notified: number;
}

const toEvent = (row: EventRow): GeofenceEvent => ({
  id: row.id,
  idempotencyKey: row.idempotency_key,
  kind: row.kind,
  placeId: row.place_id,
  placeName: row.place_name,
  roomId: row.room_id,
  roomName: row.room_name,
  occurredAt: row.occurred_at,
  latitude: row.latitude,
  longitude: row.longitude,
  accuracy: row.accuracy,
  distance: row.distance,
  source: row.source,
  notified: row.notified === 1,
});

/**
 * Commits an evaluation: the new states and the events they produced, together.
 *
 * Returns only the events that were genuinely new. `INSERT OR IGNORE` against
 * the UNIQUE index on `idempotency_key` is the last line of defence against
 * duplicates — the state machine already refuses to emit a transition twice, but
 * this survives what the state machine cannot: the process being killed between
 * writing the event and posting its notification, and iOS replaying the initial
 * state of every region each time the app launches.
 */
export function commitEvaluation(
  states: readonly TargetState[],
  events: readonly GeofenceEvent[],
): GeofenceEvent[] {
  if (states.length === 0 && events.length === 0) return [];

  return transaction((db) => {
    saveStates(states, db);

    const persisted: GeofenceEvent[] = [];
    for (const event of events) {
      const result = db.runSync(
        `INSERT OR IGNORE INTO geofence_events
           (idempotency_key, kind, place_id, place_name, room_id, room_name,
            occurred_at, latitude, longitude, accuracy, distance, source, notified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
        [
          event.idempotencyKey,
          event.kind,
          event.placeId,
          event.placeName,
          event.roomId,
          event.roomName,
          event.occurredAt,
          event.latitude,
          event.longitude,
          event.accuracy,
          event.distance,
          event.source,
        ],
      );

      // changes === 0 means the key was already there: a replay, not a new event.
      if (result.changes > 0) persisted.push({ ...event, id: result.lastInsertRowId });
    }
    return persisted;
  });
}

export function markNotified(ids: readonly number[]): void {
  if (ids.length === 0) return;
  getDatabase().runSync(
    `UPDATE geofence_events SET notified = 1 WHERE id IN (${ids.map(() => '?').join(',')});`,
    ids as number[],
  );
}

export interface EventFilter {
  placeId?: string;
  kinds?: GeofenceEventKind[];
  limit?: number;
}

export function listEvents(filter: EventFilter = {}): GeofenceEvent[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.placeId) {
    conditions.push('place_id = ?');
    params.push(filter.placeId);
  }
  if (filter.kinds && filter.kinds.length > 0) {
    conditions.push(`kind IN (${filter.kinds.map(() => '?').join(',')})`);
    params.push(...filter.kinds);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  return getDatabase()
    .getAllSync<EventRow>(
      `SELECT * FROM geofence_events ${where} ORDER BY occurred_at DESC, id DESC LIMIT ?;`,
      params,
    )
    .map(toEvent);
}

export function countEvents(): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM geofence_events;',
  );
  return row?.total ?? 0;
}

export function clearEvents(): void {
  getDatabase().runSync('DELETE FROM geofence_events;');
}

/** Newline-delimited JSON, for the "export log" action in the event screen. */
export function exportEventsAsJsonl(limit = 5000): string {
  return listEvents({ limit })
    .map((event) => JSON.stringify(event))
    .join('\n');
}
