import { getDatabase, transaction } from '@src/core/db';

import { saveStates } from './stateRepository';
import type { EventSource, GeofenceEvent, GeofenceEventKind, TargetState } from '../types';

interface EventRow {
  id: number;
  idempotency_key: string;
  kind: GeofenceEventKind;
  company_id: string;
  company_name: string;
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
  companyId: row.company_id,
  companyName: row.company_name,
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
           (idempotency_key, kind, company_id, company_name, room_id, room_name,
            occurred_at, latitude, longitude, accuracy, distance, source, notified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
        [
          event.idempotencyKey,
          event.kind,
          event.companyId,
          event.companyName,
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
  companyId?: string;
  kinds?: GeofenceEventKind[];
  limit?: number;
}

export function listEvents(filter: EventFilter = {}): GeofenceEvent[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.companyId) {
    conditions.push('company_id = ?');
    params.push(filter.companyId);
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


export function clearEvents(): void {
  getDatabase().runSync('DELETE FROM geofence_events;');
}

export function exportEventsAsJsonl(limit = 5000): string {
  return listEvents({ limit })
    .map((event) => JSON.stringify(event))
    .join('\n');
}
