import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

type BindValue = string | number | null;

let engine: SqlJsStatic | null = null;

export async function initTestSqlite(): Promise<void> {
  engine ??= await initSqlJs();
}

function flatten(params: unknown[]): BindValue[] {
  const values = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return values as BindValue[];
}

function rows<T>(db: Database, sql: string, params: unknown[], limit: number): T[] {
  const statement = db.prepare(sql);
  try {
    const bound = flatten(params);
    if (bound.length > 0) statement.bind(bound);

    const collected: T[] = [];
    while (collected.length < limit && statement.step()) {
      collected.push(statement.getAsObject() as T);
    }
    return collected;
  } finally {
    statement.free();
  }
}

export function openTestDatabase() {
  if (!engine) throw new Error('call initTestSqlite() before opening a database');
  const db = new engine.Database();

  return {
    execSync(sql: string): void {
      db.exec(sql);
    },

    runSync(sql: string, ...params: unknown[]) {
      db.run(sql, flatten(params));
      const [result] = db.exec('SELECT last_insert_rowid() AS id;');
      return {
        changes: db.getRowsModified(),
        lastInsertRowId: Number(result?.values?.[0]?.[0] ?? 0),
      };
    },

    getAllSync<T>(sql: string, ...params: unknown[]): T[] {
      return rows<T>(db, sql, params, Number.POSITIVE_INFINITY);
    },

    getFirstSync<T>(sql: string, ...params: unknown[]): T | null {
      return rows<T>(db, sql, params, 1)[0] ?? null;
    },

    withTransactionSync(work: () => void): void {
      db.exec('BEGIN;');
      try {
        work();
        db.exec('COMMIT;');
      } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
      }
    },

    closeSync(): void {
      db.close();
    },
  };
}
