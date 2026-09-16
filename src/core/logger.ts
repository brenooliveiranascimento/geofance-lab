import { getDatabase } from './db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  tag: string;
  message: string;
  data: string | null;
  createdAt: number;
}

/** Keeps the table from growing without bound on a long-running device. */
const MAX_ENTRIES = 2000;
const TRIM_EVERY = 200;

let writesSinceTrim = 0;

/**
 * Structured log persisted to SQLite.
 *
 * Background tasks are the hardest part of this app to observe: by the time the
 * UI is open, whatever the headless context printed to the console is long
 * gone. Writing the log to the database means the Diagnostics screen can show
 * exactly what the task did while the app was closed — which is also how the
 * platform behaviour documented in the README was actually measured.
 */
function write(level: LogLevel, tag: string, message: string, data?: unknown): void {
  if (__DEV__) {
    const line = `[${tag}] ${message}`;
    if (level === 'error') console.error(line, data ?? '');
    else if (level === 'warn') console.warn(line, data ?? '');
    else console.log(line, data ?? '');
  }

  try {
    const db = getDatabase();
    db.runSync(
      'INSERT INTO app_log (level, tag, message, data, created_at) VALUES (?, ?, ?, ?, ?);',
      level,
      tag,
      message,
      data === undefined ? null : safeStringify(data),
      Date.now(),
    );

    writesSinceTrim += 1;
    if (writesSinceTrim >= TRIM_EVERY) {
      writesSinceTrim = 0;
      db.runSync(
        `DELETE FROM app_log WHERE id NOT IN (
           SELECT id FROM app_log ORDER BY id DESC LIMIT ?
         );`,
        MAX_ENTRIES,
      );
    }
  } catch {
    // Logging must never be the thing that breaks a geofence event.
  }
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export const logger = {
  debug: (tag: string, message: string, data?: unknown) => write('debug', tag, message, data),
  info: (tag: string, message: string, data?: unknown) => write('info', tag, message, data),
  warn: (tag: string, message: string, data?: unknown) => write('warn', tag, message, data),
  error: (tag: string, message: string, data?: unknown) => write('error', tag, message, data),
};

export function readLog(limit = 200): LogEntry[] {
  try {
    return getDatabase()
      .getAllSync<{
        id: number;
        level: LogLevel;
        tag: string;
        message: string;
        data: string | null;
        created_at: number;
      }>('SELECT * FROM app_log ORDER BY id DESC LIMIT ?;', limit)
      .map((row) => ({
        id: row.id,
        level: row.level,
        tag: row.tag,
        message: row.message,
        data: row.data,
        createdAt: row.created_at,
      }));
  } catch {
    return [];
  }
}

export function clearLog(): void {
  try {
    getDatabase().runSync('DELETE FROM app_log;');
  } catch {
    // Nothing to do — the log is best-effort by design.
  }
}
