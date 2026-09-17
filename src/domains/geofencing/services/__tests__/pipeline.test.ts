import { buildGridIndex, queryWithinRadius, type Fix, type LatLng } from '@src/core/geo';

import { DEFAULT_ROUTE_OPTIONS, buildCrossingRoute } from '../routeSimulator';
import { evaluateFix, invalidateGeometry, type TransitionConfig } from '../transitionEngine';
import { selectRegions } from '../regionReconciler';
import { MONITOR_CONFIG } from '../../config';
import type { GeofenceEvent, Company, Room, TargetState } from '../../types';

const seed = require('../../../../__fixtures__/companies.json') as {
  count: number;
  companies: {
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

const ALL_COMPANIES: Company[] = seed.companies.map((entry) => ({
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

const ALL_ROOMS: Room[] = seed.companies.flatMap((entry) =>
  (entry.rooms ?? []).map((room) => ({
    id: room.id,
    companyId: entry.id,
    name: room.name,
    polygon: room.polygon,
    createdAt: 0,
  })),
);

const ROOMS_BY_COMPANY = new Map<string, Room[]>();
for (const room of ALL_ROOMS) {
  const bucket = ROOMS_BY_COMPANY.get(room.companyId) ?? [];
  bucket.push(room);
  ROOMS_BY_COMPANY.set(room.companyId, bucket);
}

const INDEX = buildGridIndex(ALL_COMPANIES, (company: Company) => company as LatLng);
const MAX_ACTIVE_RADIUS = Math.max(...ALL_COMPANIES.map((company) => company.activeRadius));

const SUBJECT = ALL_COMPANIES.find((company) => company.id === 'empresa-01')!;

function walk(route: Fix[], states = new Map<string, TargetState>()) {
  const events: GeofenceEvent[] = [];

  for (const fix of route) {
    const nearby = queryWithinRadius(INDEX, fix, MAX_ACTIVE_RADIUS).map((r) => r.item);
    const occupied = [...states.values()]
      .filter((s) => s.targetKind === 'company' && s.state === 'inside')
      .map((s) => s.targetId);

    const seen = new Set(nearby.map((p) => p.id));
    for (const id of occupied) {
      if (!seen.has(id)) {
        const company = ALL_COMPANIES.find((p) => p.id === id);
        if (company) nearby.push(company);
      }
    }

    const result = evaluateFix({
      fix,
      companies: nearby,
      roomsByCompany: ROOMS_BY_COMPANY,
      states,
      config: CONFIG,
      source: 'simulator',
    });

    for (const state of result.changedStates) states.set(state.targetId, state);
    events.push(...result.events);
  }

  return { events, states };
}

const routeThrough = (company: Company, endAt = new Date(2026, 8, 16, 12, 0, 0).getTime()) =>
  buildCrossingRoute(company, { ...DEFAULT_ROUTE_OPTIONS, endAt });

beforeEach(() => invalidateGeometry());

describe('the shipped dataset', () => {
  it('has the 500+ points the brief asks for', () => {
    expect(seed.count).toBeGreaterThanOrEqual(500);
    expect(ALL_COMPANIES).toHaveLength(seed.count);
  });

  it('keeps activeRadius at or above radius everywhere', () => {
    for (const company of ALL_COMPANIES) {
      expect(company.activeRadius).toBeGreaterThanOrEqual(company.radius);
    }
  });

  it('gives every polygonal company rooms that enclose area', () => {
    const withPolygon = ALL_COMPANIES.filter((company) => company.polygon !== null);
    expect(withPolygon.length).toBeGreaterThan(0);

    for (const company of withPolygon) {
      const rooms = ROOMS_BY_COMPANY.get(company.id) ?? [];
      expect(rooms.length).toBeGreaterThan(0);
      for (const room of rooms) expect(room.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('has unique ids across companies and rooms', () => {
    const ids = [...ALL_COMPANIES.map((p) => p.id), ...ALL_ROOMS.map((r) => r.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('walking through a company', () => {
  const { events } = walk(routeThrough(SUBJECT));
  const forCompany = events.filter((e) => e.companyId === SUBJECT.id);

  it('enters the company, crosses two rooms, and leaves — in that order', () => {
    expect(forCompany.map((e) => e.kind)).toEqual([
      'company_enter',
      'room_enter',
      'room_exit',
      'room_enter',
      'room_exit',
      'company_exit',
    ]);
  });

  it('names the rooms it passed through, in the order they were crossed', () => {
    const roomEvents = forCompany.filter((e) => e.kind === 'room_enter');
    expect(roomEvents.map((e) => e.roomName)).toEqual(['Escritório', 'Copa']);
    expect(roomEvents.every((e) => e.companyName === SUBJECT.name)).toBe(true);
  });

  it('never reports two rooms occupied at the same time', () => {
    let occupied = 0;
    for (const event of forCompany) {
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
    const first = walk(routeThrough(SUBJECT));
    const later = new Date(2026, 8, 16, 13, 0, 0).getTime();
    const second = walk(routeThrough(SUBJECT, later), first.states);

    const firstKeys = new Set(first.events.map((e) => e.idempotencyKey));
    for (const event of second.events) {
      expect(firstKeys.has(event.idempotencyKey)).toBe(false);
    }
  });

  it('touches only the company actually walked through', () => {
    expect(new Set(events.map((e) => e.companyId))).toEqual(new Set([SUBJECT.id]));
  });
});

describe('the region window over the full dataset', () => {
  const origin: LatLng = { latitude: SUBJECT.latitude, longitude: SUBJECT.longitude };

  it('fits 520 companies into the 20 slots iOS allows', () => {
    const result = selectRegions(ALL_COMPANIES, origin, {
      limit: 20,
      minRegionRadiusMeters: MONITOR_CONFIG.minNativeRegionRadiusMeters,
      minGuardRadiusMeters: MONITOR_CONFIG.minGuardRadiusMeters,
      guardIdentifier: MONITOR_CONFIG.guardRegionIdentifier,
    });

    expect(result.regions).toHaveLength(20);
    expect(result.omittedCount).toBe(ALL_COMPANIES.length - 19);
    expect(result.regions.every((region) => region.radius >= 100)).toBe(true);
  });

  it('keeps the company the user is standing in', () => {
    const result = selectRegions(ALL_COMPANIES, origin, {
      limit: 20,
      minRegionRadiusMeters: MONITOR_CONFIG.minNativeRegionRadiusMeters,
      minGuardRadiusMeters: MONITOR_CONFIG.minGuardRadiusMeters,
      guardIdentifier: MONITOR_CONFIG.guardRegionIdentifier,
    });
    expect(result.selected[0].company.id).toBe(SUBJECT.id);
  });

  it('evaluates a full route over 520 companies quickly', () => {
    const started = Date.now();
    walk(routeThrough(SUBJECT));
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
