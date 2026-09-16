import { getDatabase, transaction } from '@src/core/db';
import { buildGridIndex, type GridIndex, type LatLng, type Ring } from '@src/core/geo';
import { logger } from '@src/core/logger';

import { invalidateRoomGeometry } from './transitionEngine';
import type { Place, Room } from '../types';

interface PlaceRow {
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
  place_id: string;
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

const toPlace = (row: PlaceRow): Place => ({
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
  placeId: row.place_id,
  name: row.name,
  polygon: parseRing(row.polygon) ?? [],
  createdAt: row.created_at,
});

// ---------------------------------------------------------------------------
// Spatial index cache
//
// Rebuilt lazily after any write. The index serves the hot path — every
// location fix asks "which places could contain me?" — while the region
// reconciler deliberately does an exact scan instead, because it runs only on a
// guard crossing and correctness there is worth more than microseconds.
// ---------------------------------------------------------------------------

let indexCache: GridIndex<Place> | null = null;
let maxActiveRadiusCache: number | null = null;

function invalidateCaches(): void {
  indexCache = null;
  maxActiveRadiusCache = null;
}

export function listPlaces(): Place[] {
  return getDatabase().getAllSync<PlaceRow>('SELECT * FROM places ORDER BY name;').map(toPlace);
}

export function listEnabledPlaces(): Place[] {
  return getDatabase()
    .getAllSync<PlaceRow>('SELECT * FROM places WHERE enabled = 1 ORDER BY name;')
    .map(toPlace);
}

export function getPlace(id: string): Place | null {
  const row = getDatabase().getFirstSync<PlaceRow>('SELECT * FROM places WHERE id = ?;', id);
  return row ? toPlace(row) : null;
}

export function countPlaces(): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM places;',
  );
  return row?.total ?? 0;
}

export function getPlaceIndex(): GridIndex<Place> {
  if (!indexCache) {
    indexCache = buildGridIndex(listEnabledPlaces(), (place) => place as LatLng);
  }
  return indexCache;
}

/** Widest `activeRadius` in the dataset — the search radius for candidates. */
export function getMaxActiveRadius(): number {
  if (maxActiveRadiusCache === null) {
    const row = getDatabase().getFirstSync<{ value: number | null }>(
      'SELECT MAX(active_radius) AS value FROM places WHERE enabled = 1;',
    );
    maxActiveRadiusCache = row?.value ?? 0;
  }
  return maxActiveRadiusCache;
}

export function upsertPlace(place: Place): void {
  getDatabase().runSync(
    `INSERT INTO places (id, name, latitude, longitude, radius, active_radius, polygon, enabled, created_at)
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
      place.id,
      place.name,
      place.latitude,
      place.longitude,
      place.radius,
      place.activeRadius,
      place.polygon ? JSON.stringify(place.polygon) : null,
      place.enabled ? 1 : 0,
      place.createdAt,
    ],
  );
  invalidateCaches();
}

export function setPlaceEnabled(id: string, enabled: boolean): void {
  getDatabase().runSync('UPDATE places SET enabled = ? WHERE id = ?;', enabled ? 1 : 0, id);
  invalidateCaches();
}

export function deletePlace(id: string): void {
  transaction((db) => {
    // monitor_state has no FK (targets are both places and rooms), so its rows
    // are cleared explicitly; rooms cascade.
    db.runSync('DELETE FROM monitor_state WHERE place_id = ?;', id);
    db.runSync('DELETE FROM places WHERE id = ?;', id);
  });
  invalidateCaches();
  invalidateRoomGeometry();
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export function listRooms(placeId: string): Room[] {
  return getDatabase()
    .getAllSync<RoomRow>('SELECT * FROM rooms WHERE place_id = ? ORDER BY name;', placeId)
    .map(toRoom);
}

export function listAllRooms(): Room[] {
  return getDatabase().getAllSync<RoomRow>('SELECT * FROM rooms ORDER BY name;').map(toRoom);
}

/** Rooms grouped by place, in the shape the transition engine expects. */
export function getRoomsByPlace(placeIds?: readonly string[]): Map<string, Room[]> {
  const rooms =
    placeIds && placeIds.length > 0
      ? getDatabase()
          .getAllSync<RoomRow>(
            `SELECT * FROM rooms WHERE place_id IN (${placeIds.map(() => '?').join(',')});`,
            placeIds as string[],
          )
          .map(toRoom)
      : listAllRooms();

  const grouped = new Map<string, Room[]>();
  for (const room of rooms) {
    const bucket = grouped.get(room.placeId);
    if (bucket) bucket.push(room);
    else grouped.set(room.placeId, [room]);
  }
  return grouped;
}

export function upsertRoom(room: Room): void {
  getDatabase().runSync(
    `INSERT INTO rooms (id, place_id, name, polygon, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       place_id = excluded.place_id,
       name = excluded.name,
       polygon = excluded.polygon;`,
    [room.id, room.placeId, room.name, JSON.stringify(room.polygon), room.createdAt],
  );
  invalidateRoomGeometry(room.id);
}

export function deleteRoom(id: string): void {
  transaction((db) => {
    db.runSync('DELETE FROM monitor_state WHERE target_id = ?;', id);
    db.runSync('DELETE FROM rooms WHERE id = ?;', id);
  });
  invalidateRoomGeometry(id);
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export interface SeedPayload {
  places: {
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

/**
 * Loads the bundled dataset. One transaction for all 500+ rows: row-by-row
 * inserts would each take their own implicit transaction and turn a sub-second
 * import into tens of seconds of fsyncs.
 */
export function seedPlaces(payload: SeedPayload, { replace = true } = {}): number {
  const now = Date.now();

  const inserted = transaction((db) => {
    if (replace) {
      db.runSync('DELETE FROM monitor_state;');
      db.runSync('DELETE FROM rooms;');
      db.runSync('DELETE FROM places;');
    }

    let count = 0;
    for (const entry of payload.places) {
      db.runSync(
        `INSERT INTO places (id, name, latitude, longitude, radius, active_radius, polygon, enabled, created_at)
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
          `INSERT INTO rooms (id, place_id, name, polygon, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             place_id = excluded.place_id,
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
  invalidateRoomGeometry();
  logger.info('places', 'seeded dataset', { places: inserted });
  return inserted;
}
