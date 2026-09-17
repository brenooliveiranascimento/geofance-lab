import { getDatabase, transaction } from '@src/core/db';
import { buildGridIndex, type GridIndex, type LatLng, type Ring } from '@src/core/geo';
import { logger } from '@src/core/logger';

import { invalidateGeometry } from './transitionEngine';
import type { Company, Room } from '../types';

interface CompanyRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  active_radius: number;
  polygon: string | null;
  enabled: number;
  created_at: number;
}

interface RoomRow {
  id: string;
  company_id: string;
  name: string;
  polygon: string;
  created_at: number;
}

function parseRing(raw: string | null): Ring | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Ring) : null;
  } catch {
    return null;
  }
}

const toCompany = (row: CompanyRow): Company => ({
  id: row.id,
  name: row.name,
  latitude: row.latitude,
  longitude: row.longitude,
  radius: row.radius,
  activeRadius: row.active_radius,
  polygon: parseRing(row.polygon),
  enabled: row.enabled === 1,
  createdAt: row.created_at,
});

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  companyId: row.company_id,
  name: row.name,
  polygon: parseRing(row.polygon) ?? [],
  createdAt: row.created_at,
});

let indexCache: GridIndex<Company> | null = null;
let maxActiveRadiusCache: number | null = null;

function invalidateCaches(): void {
  indexCache = null;
  maxActiveRadiusCache = null;
}

export function listCompanies(): Company[] {
  return getDatabase().getAllSync<CompanyRow>('SELECT * FROM companies ORDER BY name;').map(toCompany);
}

export function listEnabledCompanies(): Company[] {
  return getDatabase()
    .getAllSync<CompanyRow>('SELECT * FROM companies WHERE enabled = 1 ORDER BY name;')
    .map(toCompany);
}

export function getCompany(id: string): Company | null {
  const row = getDatabase().getFirstSync<CompanyRow>('SELECT * FROM companies WHERE id = ?;', id);
  return row ? toCompany(row) : null;
}

export function countCompanies(): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM companies;',
  );
  return row?.total ?? 0;
}

export function getCompanyIndex(): GridIndex<Company> {
  if (!indexCache) {
    indexCache = buildGridIndex(listEnabledCompanies(), (company) => company as LatLng);
  }
  return indexCache;
}

export function getMaxActiveRadius(): number {
  if (maxActiveRadiusCache === null) {
    const row = getDatabase().getFirstSync<{ value: number | null }>(
      'SELECT MAX(active_radius) AS value FROM companies WHERE enabled = 1;',
    );
    maxActiveRadiusCache = row?.value ?? 0;
  }
  return maxActiveRadiusCache;
}

export function upsertCompany(company: Company): void {
  getDatabase().runSync(
    `INSERT INTO companies (id, name, latitude, longitude, radius, active_radius, polygon, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       radius = excluded.radius,
       active_radius = excluded.active_radius,
       polygon = excluded.polygon,
       enabled = excluded.enabled;`,
    [
      company.id,
      company.name,
      company.latitude,
      company.longitude,
      company.radius,
      company.activeRadius,
      company.polygon ? JSON.stringify(company.polygon) : null,
      company.enabled ? 1 : 0,
      company.createdAt,
    ],
  );
  invalidateCaches();
}

export function setCompanyEnabled(id: string, enabled: boolean): void {
  getDatabase().runSync('UPDATE companies SET enabled = ? WHERE id = ?;', enabled ? 1 : 0, id);
  invalidateCaches();
}

export function deleteCompany(id: string): void {
  transaction((db) => {
    db.runSync('DELETE FROM monitor_state WHERE company_id = ?;', id);
    db.runSync('DELETE FROM companies WHERE id = ?;', id);
  });
  invalidateCaches();
  invalidateGeometry();
}

export function listRooms(companyId: string): Room[] {
  return getDatabase()
    .getAllSync<RoomRow>('SELECT * FROM rooms WHERE company_id = ? ORDER BY name;', companyId)
    .map(toRoom);
}

export function listAllRooms(): Room[] {
  return getDatabase().getAllSync<RoomRow>('SELECT * FROM rooms ORDER BY name;').map(toRoom);
}

export function getRoomsByCompany(companyIds?: readonly string[]): Map<string, Room[]> {
  const rooms =
    companyIds && companyIds.length > 0
      ? getDatabase()
          .getAllSync<RoomRow>(
            `SELECT * FROM rooms WHERE company_id IN (${companyIds.map(() => '?').join(',')});`,
            companyIds as string[],
          )
          .map(toRoom)
      : listAllRooms();

  const grouped = new Map<string, Room[]>();
  for (const room of rooms) {
    const bucket = grouped.get(room.companyId);
    if (bucket) bucket.push(room);
    else grouped.set(room.companyId, [room]);
  }
  return grouped;
}

export function countRoomsByCompany(): Map<string, number> {
  const rows = getDatabase().getAllSync<{ company_id: string; total: number }>(
    'SELECT company_id, COUNT(*) AS total FROM rooms GROUP BY company_id;',
  );
  return new Map(rows.map((row) => [row.company_id, row.total]));
}

export function upsertRoom(room: Room): void {
  getDatabase().runSync(
    `INSERT INTO rooms (id, company_id, name, polygon, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       company_id = excluded.company_id,
       name = excluded.name,
       polygon = excluded.polygon;`,
    [room.id, room.companyId, room.name, JSON.stringify(room.polygon), room.createdAt],
  );
  invalidateGeometry(room.id);
}

export function deleteRoom(id: string): void {
  transaction((db) => {
    db.runSync('DELETE FROM monitor_state WHERE target_id = ?;', id);
    db.runSync('DELETE FROM rooms WHERE id = ?;', id);
  });
  invalidateGeometry(id);
}

export interface SeedPayload {
  companies: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    activeRadius: number;
    polygon?: Ring | null;
    rooms?: { id: string; name: string; polygon: Ring }[];
  }[];
}

export function seedCompanies(payload: SeedPayload, { replace = true } = {}): number {
  const now = Date.now();

  const inserted = transaction((db) => {
    if (replace) {
      db.runSync('DELETE FROM monitor_state;');
      db.runSync('DELETE FROM rooms;');
      db.runSync('DELETE FROM companies;');
    }

    let count = 0;
    for (const entry of payload.companies) {
      db.runSync(
        `INSERT INTO companies (id, name, latitude, longitude, radius, active_radius, polygon, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           latitude = excluded.latitude,
           longitude = excluded.longitude,
           radius = excluded.radius,
           active_radius = excluded.active_radius,
           polygon = excluded.polygon;`,
        [
          entry.id,
          entry.name,
          entry.latitude,
          entry.longitude,
          entry.radius,
          entry.activeRadius,
          entry.polygon ? JSON.stringify(entry.polygon) : null,
          now,
        ],
      );

      for (const room of entry.rooms ?? []) {
        db.runSync(
          `INSERT INTO rooms (id, company_id, name, polygon, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             company_id = excluded.company_id,
             name = excluded.name,
             polygon = excluded.polygon;`,
          [room.id, entry.id, room.name, JSON.stringify(room.polygon), now],
        );
      }

      count += 1;
    }
    return count;
  });

  invalidateCaches();
  invalidateGeometry();
  logger.info('companies', 'seeded dataset', { companies: inserted });
  return inserted;
}
