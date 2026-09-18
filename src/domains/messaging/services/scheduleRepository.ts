import { getDatabase, readJson, transaction, writeJson } from '@src/core/db';

import { MESSAGING_KEYS } from '@src/domains/messaging/config';
import type { ScheduleState, ScheduledMessage, SequenceId } from '@src/domains/messaging/types';

interface ScheduleRow {
  sequence: SequenceId;
  position: number;
  message_id: string;
  scheduled_for: number;
  notification_id: string | null;
  state: ScheduleState;
  delivered_at: number | null;
}

const toScheduled = (row: ScheduleRow): ScheduledMessage => ({
  sequence: row.sequence,
  position: row.position,
  messageId: row.message_id,
  scheduledFor: row.scheduled_for,
  notificationId: row.notification_id,
  state: row.state,
  deliveredAt: row.delivered_at,
});

export function listSchedule(): ScheduledMessage[] {
  return getDatabase()
    .getAllSync<ScheduleRow>('SELECT * FROM message_schedule ORDER BY scheduled_for;')
    .map(toScheduled);
}

export function markScheduled(
  sequence: SequenceId,
  position: number,
  messageId: string,
  scheduledFor: number,
  notificationId: string | null,
): void {
  getDatabase().runSync(
    `INSERT INTO message_schedule
       (sequence, position, message_id, scheduled_for, notification_id, state, delivered_at)
     VALUES (?, ?, ?, ?, ?, 'scheduled', NULL)
     ON CONFLICT(sequence, position) DO UPDATE SET
       message_id = excluded.message_id,
       scheduled_for = excluded.scheduled_for,
       notification_id = excluded.notification_id,
       state = 'scheduled',
       delivered_at = NULL;`,
    [sequence, position, messageId, scheduledFor, notificationId],
  );
}

export function markDelivered(
  sequence: SequenceId,
  position: number,
  deliveredAt: number,
  db = getDatabase(),
): boolean {
  const result = db.runSync(
    `UPDATE message_schedule
        SET state = 'delivered', delivered_at = ?
      WHERE sequence = ? AND position = ? AND state = 'scheduled';`,
    [deliveredAt, sequence, position],
  );
  return result.changes > 0;
}

export function countByState(state: ScheduleState): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM message_schedule WHERE state = ?;',
    state,
  );
  return row?.total ?? 0;
}

export function nextScheduled(): ScheduledMessage | null {
  const row = getDatabase().getFirstSync<ScheduleRow>(
    `SELECT * FROM message_schedule
      WHERE state = 'scheduled' AND scheduled_for > ?
      ORDER BY scheduled_for LIMIT 1;`,
    Date.now(),
  );
  return row ? toScheduled(row) : null;
}

export function clearSchedule(): void {
  transaction((db) => {
    db.runSync('DELETE FROM message_schedule;');
    db.runSync('DELETE FROM delivery_receipts;');
  });
}

export const readEnrolledAt = (): number | null => readJson<number>(MESSAGING_KEYS.enrolledAt);

export function enrol(at: number = Date.now()): number {
  const existing = readEnrolledAt();
  if (existing !== null) return existing;
  writeJson(MESSAGING_KEYS.enrolledAt, at);
  return at;
}

export function resetEnrolment(): void {
  writeJson(MESSAGING_KEYS.enrolledAt, null);
  clearSchedule();
}
