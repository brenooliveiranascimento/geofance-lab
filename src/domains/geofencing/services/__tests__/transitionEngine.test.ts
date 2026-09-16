import { METERS_PER_DEGREE_LATITUDE } from '@src/core/geo';
import type { Fix } from '@src/core/geo';

import { evaluateFix, invalidateRoomGeometry, type TransitionConfig } from '../transitionEngine';
import type { GeofenceEvent, Place, Room, TargetState } from '../../types';

const CONFIG: TransitionConfig = {
  maxAccuracyMeters: 100,
  maxAccuracyMarginRatio: 0.5,
  confirmations: 2,
  minimumDwellMs: 10_000,
};

const HOME: Place = {
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

/** A fix `meters` due north of the place, so the distance is exact. */
function fixAt(meters: number, timestamp: number, accuracy: number | null = 5): Fix {
  return {
    latitude: HOME.latitude + meters / METERS_PER_DEGREE_LATITUDE,
    longitude: HOME.longitude,
    accuracy,
    timestamp,
  };
}

interface RunResult {
  events: GeofenceEvent[];
  states: Map<string, TargetState>;
  rejected: number;
}

/** Feeds a sequence of fixes through the engine, threading state as the DB would. */
function run(
  fixes: Fix[],
  options: {
    places?: Place[];
    rooms?: Room[];
    config?: TransitionConfig;
    states?: Map<string, TargetState>;
  } = {},
): RunResult {
  const places = options.places ?? [HOME];
  const rooms = options.rooms ?? [];
  const config = options.config ?? CONFIG;
  const states = options.states ?? new Map<string, TargetState>();

  const roomsByPlace = new Map<string, Room[]>();
  for (const room of rooms) {
    const bucket = roomsByPlace.get(room.placeId) ?? [];
    bucket.push(room);
    roomsByPlace.set(room.placeId, bucket);
  }

  const events: GeofenceEvent[] = [];
  let rejected = 0;

  for (const fix of fixes) {
    const result = evaluateFix({ fix, places, roomsByPlace, states, config, source: 'location_update' });
    if (!result.accepted) rejected += 1;
    for (const state of result.changedStates) states.set(state.targetId, state);
    events.push(...result.events);
  }

  return { events, states, rejected };
}

/** Fixes at a fixed distance, spaced far enough apart to clear the dwell guard. */
const hold = (meters: number, count: number, startAt = 0, step = 6_000, accuracy = 5): Fix[] =>
  Array.from({ length: count }, (_, i) => fixAt(meters, startAt + i * step, accuracy));

beforeEach(() => invalidateRoomGeometry());

describe('accuracy gate', () => {
  it('rejects readings worse than the configured ceiling', () => {
    const result = run([fixAt(10, 1_000, 250)]);
    expect(result.rejected).toBe(1);
    expect(result.events).toHaveLength(0);
    expect(result.states.size).toBe(0);
  });

  it('accepts readings with no reported accuracy', () => {
    const result = run(hold(10, 3, 0, 6_000).map((f) => ({ ...f, accuracy: null })));
    expect(result.rejected).toBe(0);
    expect(result.events.map((e) => e.kind)).toEqual(['place_enter']);
  });
});

describe('entry uses radius, exit uses activeRadius', () => {
  it('enters once inside the radius', () => {
    const { events } = run(hold(20, 3));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('place_enter');
    expect(events[0].placeId).toBe('home');
  });

  it('does not enter while only inside the activeRadius', () => {
    // 80 m: beyond `radius` (60) but within `activeRadius` (100).
    const { events, states } = run(hold(80, 6));
    expect(events).toHaveLength(0);
    expect(states.get('home')?.state).toBe('outside');
  });

  it('exits only after clearing the activeRadius', () => {
    const enter = run(hold(20, 3));
    expect(enter.events.map((e) => e.kind)).toEqual(['place_enter']);

    // Drift out to 80 m — inside the dead band, so nothing happens.
    const band = run(hold(80, 4, 30_000), { states: enter.states });
    expect(band.events).toHaveLength(0);
    expect(band.states.get('home')?.state).toBe('inside');

    // Past 100 m the exit fires.
    const out = run(hold(140, 3, 80_000), { states: band.states });
    expect(out.events.map((e) => e.kind)).toEqual(['place_exit']);
  });

  it('produces no events for a user loitering on the boundary', () => {
    // Oscillating across `radius` but never past `activeRadius`: the dead band
    // is exactly what this requirement is for.
    const enter = run(hold(20, 3));
    const fixes: Fix[] = [];
    for (let i = 0; i < 40; i += 1) {
      fixes.push(fixAt(i % 2 === 0 ? 55 : 95, 40_000 + i * 6_000));
    }
    const wobble = run(fixes, { states: enter.states });
    expect(wobble.events).toHaveLength(0);
    expect(wobble.states.get('home')?.state).toBe('inside');
  });
});

describe('debounce and dwell', () => {
  it('needs consecutive agreeing fixes before committing', () => {
    const single = run([fixAt(10, 20_000)]);
    expect(single.events).toHaveLength(0);
    expect(single.states.get('home')?.pendingState).toBe('inside');
    expect(single.states.get('home')?.pendingCount).toBe(1);
  });

  it('resets the candidate when a fix disagrees', () => {
    const result = run([fixAt(10, 10_000), fixAt(300, 20_000), fixAt(10, 30_000)]);
    expect(result.events).toHaveLength(0);
    expect(result.states.get('home')?.pendingCount).toBe(1);
  });

  it('holds a committed state for the dwell window', () => {
    const enter = run(hold(20, 3));
    const enteredAt = enter.states.get('home')!.since;

    // Two agreeing "outside" fixes, but only 2 s after entering.
    const tooSoon = run(
      [fixAt(300, enteredAt + 1_000), fixAt(300, enteredAt + 2_000)],
      { states: enter.states },
    );
    expect(tooSoon.events).toHaveLength(0);
    expect(tooSoon.states.get('home')?.state).toBe('inside');

    // Past the dwell window the same evidence commits.
    const later = run([fixAt(300, enteredAt + 11_000)], { states: tooSoon.states });
    expect(later.events.map((e) => e.kind)).toEqual(['place_exit']);
  });

  it('classifies a never-seen target without waiting out the dwell', () => {
    // A fresh install that boots up already inside a place should not need
    // 10 s of dwell before it knows where it is.
    const { events } = run([fixAt(10, 1_000), fixAt(10, 2_000)]);
    expect(events.map((e) => e.kind)).toEqual(['place_enter']);
  });
});

describe('confidence margin', () => {
  it('refuses to claim entry while the error circle straddles the radius', () => {
    // 45 m away with 30 m accuracy: the circle reaches 75 m, past the 60 m radius.
    const { events } = run(hold(45, 4, 0, 6_000, 30));
    expect(events).toHaveLength(0);
  });

  it('still allows entry once the error circle fits', () => {
    const { events } = run(hold(25, 3, 0, 6_000, 30));
    expect(events.map((e) => e.kind)).toEqual(['place_enter']);
  });

  it('caps the margin so a small geofence stays reachable', () => {
    const tight: Place = { ...HOME, id: 'tight', radius: 40, activeRadius: 60 };
    // 90 m accuracy would exceed the radius outright; the cap holds it to 20 m,
    // so standing 15 m away still registers as entry.
    const { events } = run(hold(15, 3, 0, 6_000, 90), { places: [tight] });
    expect(events.map((e) => e.kind)).toEqual(['place_enter']);
  });
});

describe('deduplication', () => {
  it('increments the sequence so each transition gets a unique key', () => {
    const enter = run(hold(20, 3));
    const exit = run(hold(300, 3, 60_000), { states: enter.states });
    const back = run(hold(20, 3, 120_000), { states: exit.states });

    const keys = [...enter.events, ...exit.events, ...back.events].map((e) => e.idempotencyKey);
    expect(keys).toEqual(['home:1:place_enter', 'home:2:place_exit', 'home:3:place_enter']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('emits nothing when the same fix is replayed', () => {
    const enter = run(hold(20, 3));
    const replay = run(hold(20, 5, 60_000), { states: enter.states });
    expect(replay.events).toHaveLength(0);
  });
});

describe('disabled and distant places', () => {
  it('ignores a disabled place', () => {
    const { events, states } = run(hold(5, 4), { places: [{ ...HOME, enabled: false }] });
    expect(events).toHaveLength(0);
    expect(states.size).toBe(0);
  });

  it('reports no candidates when the list is empty', () => {
    const result = evaluateFix({
      fix: fixAt(0, 1_000),
      places: [],
      roomsByPlace: new Map(),
      states: new Map(),
      config: CONFIG,
      source: 'location_update',
    });
    expect(result.accepted).toBe(true);
    expect(result.rejectionReason).toBe('no_candidates');
  });
});

// ---------------------------------------------------------------------------
// Rooms — the multi-polygon extension. A place's circle is the coarse trigger;
// the rooms inside it are resolved by point-in-polygon on precise fixes.
// ---------------------------------------------------------------------------

/** ~10 x 10 m square centred on the place, so `fixAt(0)` lands inside it. */
const LIVING_ROOM: Room = {
  id: 'living',
  placeId: 'home',
  name: 'Sala',
  polygon: [
    { latitude: HOME.latitude - 0.000045, longitude: HOME.longitude - 0.000049 },
    { latitude: HOME.latitude - 0.000045, longitude: HOME.longitude + 0.000049 },
    { latitude: HOME.latitude + 0.000045, longitude: HOME.longitude + 0.000049 },
    { latitude: HOME.latitude + 0.000045, longitude: HOME.longitude - 0.000049 },
  ],
  createdAt: 0,
};

/** A second square 20 m north, so the two never overlap. */
const BEDROOM: Room = {
  id: 'bedroom',
  placeId: 'home',
  name: 'Quarto',
  polygon: LIVING_ROOM.polygon.map((vertex) => ({
    latitude: vertex.latitude + 20 / METERS_PER_DEGREE_LATITUDE,
    longitude: vertex.longitude,
  })),
  createdAt: 0,
};

describe('rooms', () => {
  const rooms = [LIVING_ROOM, BEDROOM];

  it('reports the place and the room the user is standing in', () => {
    const { events } = run(hold(0, 3), { rooms });
    expect(events.map((e) => e.kind).sort()).toEqual(['place_enter', 'room_enter']);

    const roomEvent = events.find((e) => e.kind === 'room_enter')!;
    expect(roomEvent.roomId).toBe('living');
    expect(roomEvent.roomName).toBe('Sala');
    expect(roomEvent.placeName).toBe('Casa');
  });

  it('does not enter a room the user is not standing in', () => {
    const { events, states } = run(hold(0, 3), { rooms });
    expect(events.filter((e) => e.roomId === 'bedroom')).toHaveLength(0);
    expect(states.get('bedroom')?.state ?? 'outside').toBe('outside');
  });

  it('switches rooms without touching the place state', () => {
    const start = run(hold(0, 3), { rooms });
    const moved = run(hold(20, 3, 60_000), { rooms, states: start.states });

    expect(moved.events.map((e) => e.kind).sort()).toEqual(['room_enter', 'room_exit']);
    expect(moved.events.find((e) => e.kind === 'room_exit')!.roomId).toBe('living');
    expect(moved.events.find((e) => e.kind === 'room_enter')!.roomId).toBe('bedroom');
    expect(moved.states.get('home')?.state).toBe('inside');
  });

  it('stays in the place when standing in none of its rooms', () => {
    // 40 m north: inside the 60 m radius, outside both room polygons.
    const { events, states } = run(hold(40, 3), { rooms });
    expect(events.map((e) => e.kind)).toEqual(['place_enter']);
    expect(states.get('living')?.state ?? 'outside').toBe('outside');
  });

  it('evicts the occupied room when the place is left', () => {
    const inside = run(hold(0, 3), { rooms });
    expect(inside.states.get('living')?.state).toBe('inside');

    const gone = run(hold(500, 3, 60_000), { rooms, states: inside.states });
    expect(gone.events.map((e) => e.kind)).toContain('place_exit');
    expect(gone.events.map((e) => e.kind)).toContain('room_exit');
    expect(gone.states.get('living')?.state).toBe('outside');
    expect(gone.states.get('home')?.state).toBe('outside');
  });

  it('can re-enter a room after leaving the place entirely', () => {
    const first = run(hold(0, 3), { rooms });
    const away = run(hold(500, 3, 60_000), { rooms, states: first.states });
    const back = run(hold(0, 3, 120_000), { rooms, states: away.states });

    expect(back.events.map((e) => e.kind).sort()).toEqual(['place_enter', 'room_enter']);
    // The sequence counter keeps every key distinct across the whole round trip.
    const keys = [...first.events, ...away.events, ...back.events].map((e) => e.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never marks two non-overlapping rooms as occupied at once', () => {
    const start = run(hold(0, 3), { rooms });
    const moved = run(hold(20, 3, 60_000), { rooms, states: start.states });
    const occupied = [...moved.states.values()].filter(
      (s) => s.targetKind === 'room' && s.state === 'inside',
    );
    expect(occupied.map((s) => s.targetId)).toEqual(['bedroom']);
  });
});

describe('overlapping rooms', () => {
  /** Two rooms that share a wall — the common case in any floor plan. */
  const WEST: Room = {
    id: 'a-west',
    placeId: 'home',
    name: 'Oeste',
    polygon: [
      { latitude: HOME.latitude - 0.00005, longitude: HOME.longitude - 0.0001 },
      { latitude: HOME.latitude - 0.00005, longitude: HOME.longitude },
      { latitude: HOME.latitude + 0.00005, longitude: HOME.longitude },
      { latitude: HOME.latitude + 0.00005, longitude: HOME.longitude - 0.0001 },
    ],
    createdAt: 0,
  };

  const EAST: Room = {
    ...WEST,
    id: 'b-east',
    name: 'Leste',
    polygon: WEST.polygon.map((vertex) => ({
      ...vertex,
      longitude: vertex.longitude + 0.0001,
    })),
  };

  it('picks exactly one room for a fix standing on the shared wall', () => {
    // The wall runs along HOME's longitude, so `fixAt` lands exactly on it —
    // both polygons contain the point by the boundary rule.
    const { states } = run(hold(0, 3), { rooms: [WEST, EAST] });
    const occupied = [...states.values()].filter(
      (state) => state.targetKind === 'room' && state.state === 'inside',
    );
    expect(occupied).toHaveLength(1);
  });

  it('resolves the tie deterministically', () => {
    const first = run(hold(0, 3), { rooms: [WEST, EAST] });
    const second = run(hold(0, 3), { rooms: [EAST, WEST] });

    const occupiedIn = (result: typeof first) =>
      [...result.states.values()]
        .filter((state) => state.targetKind === 'room' && state.state === 'inside')
        .map((state) => state.targetId);

    expect(occupiedIn(first)).toEqual(occupiedIn(second));
  });
});
