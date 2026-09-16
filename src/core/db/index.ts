import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS } from './schema';

export const DATABASE_NAME = 'geofence-lab.db';

let database: SQLiteDatabase | null = null;

/**
 * The single database handle, opened on first use.
 *
 * Everything that a background task touches lives here rather than in MMKV.
 * The TaskManager headless context is the most fragile place this app runs, and
 * SQLite gives us transactions there — a location fix that produces a
 * transition must write the new state and the event together or not at all,
 * otherwise a kill mid-write would let the event fire twice.
 *
 * WAL mode matters for the same reason: the foreground UI reads the event log
 * while the background task appends to it, and WAL lets those proceed without
 * blocking each other.
 */
export function getDatabase(): SQLiteDatabase {
  if (database) return database;

  const handle = openDatabaseSync(DATABASE_NAME);
  handle.execSync('PRAGMA journal_mode = WAL;');
  handle.execSync('PRAGMA foreign_keys = ON;');
  migrate(handle);

  database = handle;
  return handle;
}

function migrate(handle: SQLiteDatabase): void {
  const row = handle.getFirstSync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    handle.execSync(MIGRATIONS[version]);
    // PRAGMA does not accept bound parameters; the value is a loop counter.
    handle.execSync(`PRAGMA user_version = ${version + 1};`);
  }
}

/** Runs `work` inside a transaction, rolling back if it throws. */
export function transaction<T>(work: (db: SQLiteDatabase) => T): T {
  const db = getDatabase();
  let result: T;
  db.withTransactionSync(() => {
    result = work(db);
  });
  return result!;
}

// ---------------------------------------------------------------------------
// Key/value helpers — for the handful of scalars the background tasks need.
// ---------------------------------------------------------------------------

export function readValue(key: string): string | null {
  const row = getDatabase().getFirstSync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ?;',
    key,
  );
  return row?.value ?? null;
}

export function writeValue(key: string, value: string): void {
  getDatabase().runSync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    key,
    value,
  );
}

export function readJson<T>(key: string): T | null {
  const raw = readValue(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt value is not worth crashing a background task over; the caller
    // treats null as "no prior state" and rebuilds it.
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeValue(key, JSON.stringify(value));
}

export function deleteValue(key: string): void {
  getDatabase().runSync('DELETE FROM kv WHERE key = ?;', key);
}

/** Drops every row but keeps the schema. Used by the "reset" action in Settings. */
export function resetDatabase(): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.execSync(`
      DELETE FROM geofence_events;
      DELETE FROM monitor_state;
      DELETE FROM rooms;
      DELETE FROM places;
      DELETE FROM message_schedule;
      DELETE FROM delivery_receipts;
      DELETE FROM app_log;
      DELETE FROM kv;
    `);
  });
}
