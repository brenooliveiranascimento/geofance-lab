import { METERS_PER_DEGREE_LATITUDE } from '@src/core/geo';
import type { Fix } from '@src/core/geo';

import { invalidateGeometry } from '@src/domains/geofencing/services/ringGeometry';
import { evaluateFix, type TransitionConfig } from '@src/domains/geofencing/services/transitionEngine';
import type { GeofenceEvent, Company, Room, TargetState } from '@src/domains/geofencing/types';

const CONFIG: TransitionConfig = {
  maxAccuracyMeters: 100,
  maxAccuracyMarginRatio: 0.5,
  confirmations: 2,
  minimumDwellMs: 10_000,
};

const HOME: Company = {
  id: 'home',
  name: 'Casa',
  latitude: -23.55,
  longitude: -46.63,
  radius: 60,
  activeRadius: 100,
  polygon: null,
  enabled: true,
  createdAt: 0,
};

const LIVING_ROOM: Room = {
  id: 'living',
  companyId: 'home',
  name: 'Sala',
  polygon: [
    { latitude: HOME.latitude - 0.000045, longitude: HOME.longitude - 0.000049 },
    { latitude: HOME.latitude - 0.000045, longitude: HOME.longitude + 0.000049 },
    { latitude: HOME.latitude + 0.000045, longitude: HOME.longitude + 0.000049 },
    { latitude: HOME.latitude + 0.000045, longitude: HOME.longitude - 0.000049 },
  ],
  createdAt: 0,
};

const fixAt = (meters: number, timestamp: number): Fix => ({
  latitude: HOME.latitude + meters / METERS_PER_DEGREE_LATITUDE,
  longitude: HOME.longitude,
  accuracy: 5,
  timestamp,
});

const hold = (meters: number, count: number, startAt = 0): Fix[] =>
  Array.from({ length: count }, (_, i) => fixAt(meters, startAt + i * 6_000));

interface RunResult {
  events: GeofenceEvent[];
  states: Map<string, TargetState>;
}

function run(
  fixes: Fix[],
  options: { companies?: Company[]; rooms?: Room[]; states?: Map<string, TargetState> } = {},
): RunResult {
  const companies = options.companies ?? [HOME];
  const states = options.states ?? new Map<string, TargetState>();
  const roomsByCompany = new Map(options.rooms ? [[HOME.id, options.rooms]] : []);
  const events: GeofenceEvent[] = [];

  for (const fix of fixes) {
    const result = evaluateFix({
      fix,
      companies,
      roomsByCompany,
      states,
      config: CONFIG,
      source: 'location_update',
    });
    for (const state of result.changedStates) states.set(state.targetId, state);
    events.push(...result.events);
  }

  return { events, states };
}

beforeEach(() => invalidateGeometry());

describe('entry and exit', () => {
  it('enters once inside the radius', () => {
    const { events } = run(hold(20, 3));
    expect(events.map((e) => e.kind)).toEqual(['company_enter']);
    expect(events[0].companyId).toBe('home');
  });

  it('exits only after clearing the activeRadius', () => {
    const enter = run(hold(20, 3));

    const band = run(hold(80, 4, 30_000), { states: enter.states });
    expect(band.events).toHaveLength(0);
    expect(band.states.get('home')?.state).toBe('inside');

    const out = run(hold(140, 3, 80_000), { states: band.states });
    expect(out.events.map((e) => e.kind)).toEqual(['company_exit']);
  });

  it('produces no events for a user loitering on the boundary', () => {
    const enter = run(hold(20, 3));
    const wobble = run(
      Array.from({ length: 40 }, (_, i) => fixAt(i % 2 === 0 ? 55 : 95, 40_000 + i * 6_000)),
      { states: enter.states },
    );
    expect(wobble.events).toHaveLength(0);
    expect(wobble.states.get('home')?.state).toBe('inside');
  });
});

describe('no duplicates', () => {
  it('needs consecutive agreeing fixes before committing', () => {
    const single = run([fixAt(10, 20_000)]);
    expect(single.events).toHaveLength(0);
    expect(single.states.get('home')?.pendingState).toBe('inside');
  });

  it('gives every transition its own idempotency key', () => {
    const enter = run(hold(20, 3));
    const exit = run(hold(300, 3, 60_000), { states: enter.states });
    const back = run(hold(20, 3, 120_000), { states: exit.states });

    const keys = [...enter.events, ...exit.events, ...back.events].map((e) => e.idempotencyKey);
    expect(keys).toEqual(['home:1:company_enter', 'home:2:company_exit', 'home:3:company_enter']);
  });

  it('emits nothing when the same fix is replayed', () => {
    const enter = run(hold(20, 3));
    const replay = run(hold(20, 5, 60_000), { states: enter.states });
    expect(replay.events).toHaveLength(0);
  });
});

describe('rooms and outlines', () => {
  it('reports the company and the room the user is standing in', () => {
    const { events } = run(hold(0, 3), { rooms: [LIVING_ROOM] });
    expect(events.map((e) => e.kind).sort()).toEqual(['company_enter', 'room_enter']);

    const roomEvent = events.find((e) => e.kind === 'room_enter')!;
    expect(roomEvent.roomId).toBe('living');
    expect(roomEvent.companyName).toBe('Casa');
  });

  it('enters on the outline, not on the circle', () => {
    const halfWidth = 20 / (METERS_PER_DEGREE_LATITUDE * Math.cos((HOME.latitude * Math.PI) / 180));
    const halfHeight = 15 / METERS_PER_DEGREE_LATITUDE;
    const office: Company = {
      ...HOME,
      id: 'office',
      radius: 25,
      activeRadius: 45,
      polygon: [
        { latitude: HOME.latitude - halfHeight, longitude: HOME.longitude - halfWidth },
        { latitude: HOME.latitude - halfHeight, longitude: HOME.longitude + halfWidth },
        { latitude: HOME.latitude + halfHeight, longitude: HOME.longitude + halfWidth },
        { latitude: HOME.latitude + halfHeight, longitude: HOME.longitude - halfWidth },
      ],
    };

    expect(run(hold(20, 4), { companies: [office] }).events).toHaveLength(0);
    expect(run(hold(10, 3), { companies: [office] }).events.map((e) => e.kind)).toEqual([
      'company_enter',
    ]);
  });
});
