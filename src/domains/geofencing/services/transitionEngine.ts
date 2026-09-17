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

export interface TransitionConfig {
  maxAccuracyMeters: number;
  maxAccuracyMarginRatio: number;
  confirmations: number;
  minimumDwellMs: number;
}

export interface EvaluateInput {
  fix: Fix;
  places: readonly Place[];
  roomsByPlace: ReadonlyMap<string, readonly Room[]>;
  states: ReadonlyMap<string, TargetState>;
  config: TransitionConfig;
  source: EventSource;
}

export type RejectionReason = 'inaccurate' | 'no_candidates';

export interface EvaluateResult {
  accepted: boolean;
  rejectionReason?: RejectionReason;
  events: GeofenceEvent[];
  changedStates: TargetState[];
}

const OUTSIDE: PresenceState = 'outside';
const INSIDE: PresenceState = 'inside';

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

export function invalidateRoomGeometry(roomId?: string): void {
  if (roomId) geometryCache.delete(roomId);
  else geometryCache.clear();
}

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
    transitionSeq: 0,
    since: 0,
    lastDistance: null,
    pendingState: null,
    pendingCount: 0,
    updatedAt: timestamp,
  };
}

function confidenceMargin(
  accuracy: number | null,
  threshold: number,
  ratio: number,
): number {
  if (accuracy === null || accuracy <= 0) return 0;
  return Math.min(accuracy, threshold * ratio);
}

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

function applyObservation(
  previous: TargetState,
  desired: PresenceState,
  distance: number | null,
  timestamp: number,
  config: TransitionConfig,
): Commit {
  if (desired === previous.state) {
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
