import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { MIGRATIONS } from './schema';

export const DATABASE_NAME = 'geofence-lab.db';

let database: SQLiteDatabase | null = null;

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
    handle.execSync(`PRAGMA user_version = ${version + 1};`);
  }
}

export function transaction<T>(work: (db: SQLiteDatabase) => T): T {
  const db = getDatabase();
  let result: T;
  db.withTransactionSync(() => {
    result = work(db);
  });
  return result!;
}

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
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeValue(key, JSON.stringify(value));
}


export function resetDatabase(): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.execSync(`
      DELETE FROM geofence_events;
      DELETE FROM monitor_state;
      DELETE FROM rooms;
      DELETE FROM companies;
      DELETE FROM message_schedule;
      DELETE FROM delivery_receipts;
      DELETE FROM app_log;
      DELETE FROM kv;
    `);
  });
}
