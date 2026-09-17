import { buildGridIndex, queryWithinRadius, type Fix, type LatLng } from '@src/core/geo';

import { DEFAULT_ROUTE_OPTIONS, buildCrossingRoute } from '../routeSimulator';
import { evaluateFix, invalidateRoomGeometry, type TransitionConfig } from '../transitionEngine';
import { selectRegions } from '../regionReconciler';
import { MONITOR_CONFIG } from '../../config';
import type { GeofenceEvent, Place, Room, TargetState } from '../../types';

const seed = require('../../../../../assets/seed/places.json') as {
  count: number;
  places: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    activeRadius: number;
    polygon?: LatLng[];
    rooms?: { id: string; name: string; polygon: LatLng[] }[];
  }[];
};

const CONFIG: TransitionConfig = {
  maxAccuracyMeters: MONITOR_CONFIG.maxAccuracyMeters,
  maxAccuracyMarginRatio: MONITOR_CONFIG.maxAccuracyMarginRatio,
  confirmations: MONITOR_CONFIG.confirmations,
  minimumDwellMs: MONITOR_CONFIG.minimumDwellMs,
};

const ALL_PLACES: Place[] = seed.places.map((entry) => ({
  id: entry.id,
  name: entry.name,
  latitude: entry.latitude,
  longitude: entry.longitude,
  radius: entry.radius,
  activeRadius: entry.activeRadius,
  polygon: entry.polygon ?? null,
  enabled: true,
  createdAt: 0,
}));

const ALL_ROOMS: Room[] = seed.places.flatMap((entry) =>
  (entry.rooms ?? []).map((room) => ({
    id: room.id,
    placeId: entry.id,
    name: room.name,
    polygon: room.polygon,
    createdAt: 0,
  })),
);

const ROOMS_BY_PLACE = new Map<string, Room[]>();
for (const room of ALL_ROOMS) {
  const bucket = ROOMS_BY_PLACE.get(room.placeId) ?? [];
  bucket.push(room);
  ROOMS_BY_PLACE.set(room.placeId, bucket);
}

const INDEX = buildGridIndex(ALL_PLACES, (place: Place) => place as LatLng);
const MAX_ACTIVE_RADIUS = Math.max(...ALL_PLACES.map((place) => place.activeRadius));

const RESIDENCE = ALL_PLACES.find((place) => place.id === 'casa-01')!;

function walk(route: Fix[], states = new Map<string, TargetState>()) {
  const events: GeofenceEvent[] = [];

  for (const fix of route) {
    const nearby = queryWithinRadius(INDEX, fix, MAX_ACTIVE_RADIUS).map((r) => r.item);
    const occupied = [...states.values()]
      .filter((s) => s.targetKind === 'place' && s.state === 'inside')
      .map((s) => s.targetId);

    const seen = new Set(nearby.map((p) => p.id));
    for (const id of occupied) {
      if (!seen.has(id)) {
        const place = ALL_PLACES.find((p) => p.id === id);
        if (place) nearby.push(place);
      }
    }

    const result = evaluateFix({
      fix,
      places: nearby,
      roomsByPlace: ROOMS_BY_PLACE,
      states,
      config: CONFIG,
      source: 'simulator',
    });

    for (const state of result.changedStates) states.set(state.targetId, state);
    events.push(...result.events);
  }

  return { events, states };
}

const routeThrough = (place: Place, endAt = new Date(2026, 8, 16, 12, 0, 0).getTime()) =>
  buildCrossingRoute(place, { ...DEFAULT_ROUTE_OPTIONS, endAt });

beforeEach(() => invalidateRoomGeometry());

describe('the shipped dataset', () => {
  it('has the 500+ points the brief asks for', () => {
    expect(seed.count).toBeGreaterThanOrEqual(500);
    expect(ALL_PLACES).toHaveLength(seed.count);
  });

  it('keeps activeRadius at or above radius everywhere', () => {
    for (const place of ALL_PLACES) {
      expect(place.activeRadius).toBeGreaterThanOrEqual(place.radius);
    }
  });

  it('gives every residence rooms that enclose area', () => {
    const residences = ALL_PLACES.filter((place) => place.polygon !== null);
    expect(residences.length).toBeGreaterThan(0);

    for (const residence of residences) {
      const rooms = ROOMS_BY_PLACE.get(residence.id) ?? [];
      expect(rooms.length).toBeGreaterThan(0);
      for (const room of rooms) expect(room.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('has unique ids across places and rooms', () => {
    const ids = [...ALL_PLACES.map((p) => p.id), ...ALL_ROOMS.map((r) => r.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('walking through a residence', () => {
  const { events } = walk(routeThrough(RESIDENCE));
  const forPlace = events.filter((e) => e.placeId === RESIDENCE.id);

  it('enters the place, crosses two rooms, and leaves — in that order', () => {
    expect(forPlace.map((e) => e.kind)).toEqual([
      'place_enter',
      'room_enter',
      'room_exit',
      'room_enter',
      'room_exit',
      'place_exit',
    ]);
  });

  it('names the rooms it passed through, in the order they were crossed', () => {
    const roomEvents = forPlace.filter((e) => e.kind === 'room_enter');
    expect(roomEvents.map((e) => e.roomName)).toEqual(['Cozinha', 'Escritório']);
    expect(roomEvents.every((e) => e.placeName === RESIDENCE.name)).toBe(true);
  });

  it('never reports two rooms occupied at the same time', () => {
    let occupied = 0;
    for (const event of forPlace) {
      if (event.kind === 'room_enter') occupied += 1;
      if (event.kind === 'room_exit') occupied -= 1;
      expect(occupied).toBeLessThanOrEqual(1);
      expect(occupied).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits every event exactly once', () => {
    const keys = events.map((e) => e.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('produces nothing when the identical route is replayed', () => {
    const first = walk(routeThrough(RESIDENCE));
    const later = new Date(2026, 8, 16, 13, 0, 0).getTime();
    const second = walk(routeThrough(RESIDENCE, later), first.states);

    const firstKeys = new Set(first.events.map((e) => e.idempotencyKey));
    for (const event of second.events) {
      expect(firstKeys.has(event.idempotencyKey)).toBe(false);
    }
  });

  it('touches only the place actually walked through', () => {
    expect(new Set(events.map((e) => e.placeId))).toEqual(new Set([RESIDENCE.id]));
  });
});

describe('the region window over the full dataset', () => {
  const origin: LatLng = { latitude: RESIDENCE.latitude, longitude: RESIDENCE.longitude };

  it('fits 520 places into the 20 slots iOS allows', () => {
    const result = selectRegions(ALL_PLACES, origin, {
      limit: 20,
      minRegionRadiusMeters: MONITOR_CONFIG.minNativeRegionRadiusMeters,
      minGuardRadiusMeters: MONITOR_CONFIG.minGuardRadiusMeters,
      guardIdentifier: MONITOR_CONFIG.guardRegionIdentifier,
    });

    expect(result.regions).toHaveLength(20);
    expect(result.omittedCount).toBe(ALL_PLACES.length - 19);
    expect(result.regions.every((region) => region.radius >= 100)).toBe(true);
  });

  it('keeps the residence the user is standing in', () => {
    const result = selectRegions(ALL_PLACES, origin, {
      limit: 20,
      minRegionRadiusMeters: MONITOR_CONFIG.minNativeRegionRadiusMeters,
      minGuardRadiusMeters: MONITOR_CONFIG.minGuardRadiusMeters,
      guardIdentifier: MONITOR_CONFIG.guardRegionIdentifier,
    });
    expect(result.selected[0].place.id).toBe(RESIDENCE.id);
  });

  it('evaluates a full route over 520 places quickly', () => {
    const started = Date.now();
    walk(routeThrough(RESIDENCE));
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
