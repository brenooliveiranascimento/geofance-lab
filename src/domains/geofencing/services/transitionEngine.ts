import { boundingBoxOfRing, distanceMeters, isPointInPolygon, ringCentroid } from '@src/core/geo';
import type { BoundingBox, Fix, LatLng } from '@src/core/geo';

import type {
  EventSource,
  GeofenceEvent,
  GeofenceEventKind,
  Place,
  PresenceState,
  Room,
  TargetState,
} from '../types';

/**
 * The transition engine.
 *
 * Pure by design: it takes a fix, the candidate places, the rooms inside them
 * and the last persisted state, and returns the events to emit plus the states
 * to write. No database, no notifications, no platform calls — which is what
 * makes the hysteresis, the debounce and the deduplication testable without a
 * device.
 */

export interface TransitionConfig {
  maxAccuracyMeters: number;
  maxAccuracyMarginRatio: number;
  confirmations: number;
  minimumDwellMs: number;
}

export interface EvaluateInput {
  fix: Fix;
  /** Places near the fix — normally the output of the spatial index. */
  places: readonly Place[];
  /** Rooms keyed by place id. A place with no rooms may be omitted. */
  roomsByPlace: ReadonlyMap<string, readonly Room[]>;
  /** Last persisted state, keyed by target id. Missing means "never seen". */
  states: ReadonlyMap<string, TargetState>;
  config: TransitionConfig;
  source: EventSource;
}

export type RejectionReason = 'inaccurate' | 'no_candidates';

export interface EvaluateResult {
  accepted: boolean;
  rejectionReason?: RejectionReason;
  events: GeofenceEvent[];
  /** Only the states that actually changed. */
  changedStates: TargetState[];
}

const OUTSIDE: PresenceState = 'outside';
const INSIDE: PresenceState = 'inside';

/**
 * Derived room geometry, cached because every fix inside a place re-tests every
 * room in it. Invalidated by the repository whenever a polygon is edited.
 */
interface RoomGeometry {
  box: BoundingBox | null;
  centroid: LatLng | null;
}

const geometryCache = new Map<string, RoomGeometry>();

function roomGeometry(room: Room): RoomGeometry {
  const cached = geometryCache.get(room.id);
  if (cached) return cached;

  const geometry: RoomGeometry = {
    box: boundingBoxOfRing(room.polygon),
    centroid: ringCentroid(room.polygon),
  };
  geometryCache.set(room.id, geometry);
  return geometry;
}

/** Drops cached geometry for a room whose polygon was edited. */
export function invalidateRoomGeometry(roomId?: string): void {
  if (roomId) geometryCache.delete(roomId);
  else geometryCache.clear();
}

/**
 * The single room a fix places the user in, or null.
 *
 * Rooms that share a wall both contain a point standing exactly on it — the
 * boundary rule makes that deterministic rather than arbitrary, but a person is
 * still only ever in one room. Resolving to the nearest centroid, with the id as
 * a tie-break, keeps occupancy exclusive without needing the polygons to be
 * drawn with gaps between them.
 */
function resolveOccupiedRoom(fix: Fix, rooms: readonly Room[]): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;

  for (const room of rooms) {
    const geometry = roomGeometry(room);
    if (!isPointInPolygon(fix, room.polygon, geometry.box)) continue;

    const distance = geometry.centroid ? distanceMeters(fix, geometry.centroid) : 0;

    if (
      distance < bestDistance ||
      (distance === bestDistance && bestId !== null && room.id < bestId)
    ) {
      bestDistance = distance;
      bestId = room.id;
    }
  }

  return bestId;
}

function initialState(
  targetId: string,
  targetKind: TargetState['targetKind'],
  placeId: string,
  timestamp: number,
): TargetState {
  return {
    targetId,
    targetKind,
    placeId,
    state: OUTSIDE,
    // Zero marks a target that has never transitioned. The dwell guard keys off
    // this rather than off `since`, so the very first classification is not
    // delayed — the guard exists to stop an established state from flapping, and
    // a target we have never observed has nothing to protect.
    transitionSeq: 0,
    since: 0,
    lastDistance: null,
    pendingState: null,
    pendingCount: 0,
    updatedAt: timestamp,
  };
}

/**
 * Confidence margin derived from the fix's reported accuracy.
 *
 * Capped at a fraction of the threshold: without the cap, a 40 m accuracy would
 * make a 50 m geofence impossible to enter, since the error circle can never fit
 * inside it.
 */
function confidenceMargin(
  accuracy: number | null,
  threshold: number,
  ratio: number,
): number {
  if (accuracy === null || accuracy <= 0) return 0;
  return Math.min(accuracy, threshold * ratio);
}

/**
 * The hysteresis rule, and the whole of requirements "detect entry into radius"
 * and "detect exit from activeRadius".
 *
 * From outside, entry needs the fix (plus its error margin) to be within
 * `radius`. From inside, exit needs it to be clear of `activeRadius` by the same
 * margin. Between the two thresholds nothing changes — that band is what stops
 * a user loitering on the boundary from generating a stream of events.
 */
function desiredPlaceState(
  current: PresenceState,
  distance: number,
  place: Place,
  accuracy: number | null,
  config: TransitionConfig,
): PresenceState {
  if (current === OUTSIDE) {
    const margin = confidenceMargin(accuracy, place.radius, config.maxAccuracyMarginRatio);
    return distance + margin <= place.radius ? INSIDE : OUTSIDE;
  }

  const margin = confidenceMargin(accuracy, place.activeRadius, config.maxAccuracyMarginRatio);
  return distance - margin > place.activeRadius ? OUTSIDE : INSIDE;
}

interface Commit {
  state: TargetState;
  changed: boolean;
  committed: boolean;
}

/**
 * Applies one observation to one target's state machine.
 *
 * A flip is proposed, not applied: it only commits once `confirmations`
 * consecutive fixes agree, and never before the current state has been held for
 * `minimumDwellMs`. GPS noise and a brief pass along a boundary both look like a
 * flip for one reading; neither should reach the user.
 */
function applyObservation(
  previous: TargetState,
  desired: PresenceState,
  distance: number | null,
  timestamp: number,
  config: TransitionConfig,
): Commit {
  if (desired === previous.state) {
    // Back in agreement — abandon any candidate flip.
    if (previous.pendingState === null && previous.lastDistance === distance) {
      return { state: previous, changed: false, committed: false };
    }
    return {
      state: {
        ...previous,
        lastDistance: distance,
        pendingState: null,
        pendingCount: 0,
        updatedAt: timestamp,
      },
      changed: true,
      committed: false,
    };
  }

  const agreeing = previous.pendingState === desired ? previous.pendingCount + 1 : 1;

  const dwellSatisfied =
    previous.transitionSeq === 0 || timestamp - previous.since >= config.minimumDwellMs;
  const confirmed = agreeing >= config.confirmations;

  if (!confirmed || !dwellSatisfied) {
    return {
      state: {
        ...previous,
        lastDistance: distance,
        pendingState: desired,
        pendingCount: agreeing,
        updatedAt: timestamp,
      },
      changed: true,
      committed: false,
    };
  }

  return {
    state: {
      ...previous,
      state: desired,
      transitionSeq: previous.transitionSeq + 1,
      since: timestamp,
      lastDistance: distance,
      pendingState: null,
      pendingCount: 0,
      updatedAt: timestamp,
    },
    changed: true,
    committed: true,
  };
}

function makeEvent(
  kind: GeofenceEventKind,
  state: TargetState,
  place: Place,
  room: Room | null,
  fix: Fix,
  distance: number | null,
  source: EventSource,
): GeofenceEvent {
  return {
    // The sequence number is what makes this unique. Re-running the same fix,
    // or replaying it after a crash, produces the same key and the insert is
    // ignored by the UNIQUE constraint.
    idempotencyKey: `${state.targetId}:${state.transitionSeq}:${kind}`,
    kind,
    placeId: place.id,
    placeName: place.name,
    roomId: room?.id ?? null,
    roomName: room?.name ?? null,
    occurredAt: fix.timestamp,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    distance,
    source,
    notified: false,
  };
}

export function evaluateFix(input: EvaluateInput): EvaluateResult {
  const { fix, places, roomsByPlace, states, config, source } = input;

  // A reading we do not trust is worse than no reading: acting on it produces a
  // false event that the dedup layer will happily persist forever.
  if (fix.accuracy !== null && fix.accuracy > config.maxAccuracyMeters) {
    return { accepted: false, rejectionReason: 'inaccurate', events: [], changedStates: [] };
  }

  if (places.length === 0) {
    return { accepted: true, rejectionReason: 'no_candidates', events: [], changedStates: [] };
  }

  const events: GeofenceEvent[] = [];
  const changedStates: TargetState[] = [];

  for (const place of places) {
    if (!place.enabled) continue;

    const distance = distanceMeters(fix, place);
    const previous =
      states.get(place.id) ?? initialState(place.id, 'place', place.id, fix.timestamp);
    const desired = desiredPlaceState(previous.state, distance, place, fix.accuracy, config);

    const result = applyObservation(previous, desired, distance, fix.timestamp, config);
    if (result.changed) changedStates.push(result.state);

    if (result.committed) {
      events.push(
        makeEvent(
          result.state.state === INSIDE ? 'place_enter' : 'place_exit',
          result.state,
          place,
          null,
          fix,
          distance,
          source,
        ),
      );
    }

    const rooms = roomsByPlace.get(place.id) ?? [];
    if (rooms.length === 0) continue;

    const insidePlace = result.state.state === INSIDE;

    // Rooms only exist within their place. Leaving the place resolves to no
    // room at all, so a user who walks out of the house never leaves a room
    // marked as occupied — the gap that would otherwise suppress the next
    // genuine room_enter.
    const occupiedRoomId = insidePlace ? resolveOccupiedRoom(fix, rooms) : null;

    for (const room of rooms) {
      const roomPrevious =
        states.get(room.id) ?? initialState(room.id, 'room', place.id, fix.timestamp);

      const roomDesired = room.id === occupiedRoomId ? INSIDE : OUTSIDE;

      const roomResult = applyObservation(
        roomPrevious,
        roomDesired,
        null,
        fix.timestamp,
        // Leaving a place must evict its rooms immediately; waiting out the
        // dwell timer would let a stale "inside" survive the exit.
        insidePlace ? config : { ...config, confirmations: 1, minimumDwellMs: 0 },
      );

      if (roomResult.changed) changedStates.push(roomResult.state);

      if (roomResult.committed) {
        events.push(
          makeEvent(
            roomResult.state.state === INSIDE ? 'room_enter' : 'room_exit',
            roomResult.state,
            place,
            room,
            fix,
            null,
            source,
          ),
        );
      }
    }
  }

  return { accepted: true, events, changedStates };
}
