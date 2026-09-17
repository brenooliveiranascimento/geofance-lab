import {
  boundingBoxOfRing,
  distanceMeters,
  distanceToRingMeters,
  isPointInPolygon,
  ringCentroid,
} from '@src/core/geo';
import type { BoundingBox, Fix, LatLng, Ring } from '@src/core/geo';

import type {
  EventSource,
  GeofenceEvent,
  GeofenceEventKind,
  Company,
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
  companies: readonly Company[];
  roomsByCompany: ReadonlyMap<string, readonly Room[]>;
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

interface RingGeometry {
  box: BoundingBox | null;
  centroid: LatLng | null;
}

const geometryCache = new Map<string, RingGeometry>();

function ringGeometry(id: string, ring: Ring): RingGeometry {
  const cached = geometryCache.get(id);
  if (cached) return cached;

  const geometry: RingGeometry = {
    box: boundingBoxOfRing(ring),
    centroid: ringCentroid(ring),
  };
  geometryCache.set(id, geometry);
  return geometry;
}

export function invalidateGeometry(id?: string): void {
  if (id) geometryCache.delete(id);
  else geometryCache.clear();
}

function resolveOccupiedRoom(fix: Fix, rooms: readonly Room[]): string | null {
  let bestId: string | null = null;
  let bestDistance = Infinity;

  for (const room of rooms) {
    const geometry = ringGeometry(room.id, room.polygon);
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
  companyId: string,
  timestamp: number,
): TargetState {
  return {
    targetId,
    targetKind,
    companyId,
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

function desiredCircularState(
  current: PresenceState,
  distance: number,
  company: Company,
  accuracy: number | null,
  config: TransitionConfig,
): PresenceState {
  if (current === OUTSIDE) {
    const margin = confidenceMargin(accuracy, company.radius, config.maxAccuracyMarginRatio);
    return distance + margin <= company.radius ? INSIDE : OUTSIDE;
  }

  const margin = confidenceMargin(accuracy, company.activeRadius, config.maxAccuracyMarginRatio);
  return distance - margin > company.activeRadius ? OUTSIDE : INSIDE;
}

function desiredPolygonState(
  current: PresenceState,
  fix: Fix,
  company: Company,
  polygon: Ring,
): PresenceState {
  const geometry = ringGeometry(company.id, polygon);
  const inside = isPointInPolygon(fix, polygon, geometry.box);

  if (current === OUTSIDE) return inside ? INSIDE : OUTSIDE;
  if (inside) return INSIDE;

  const buffer = Math.max(company.activeRadius - company.radius, 0);
  return distanceToRingMeters(fix, polygon) > buffer ? OUTSIDE : INSIDE;
}

function desiredCompanyState(
  current: PresenceState,
  fix: Fix,
  distance: number,
  company: Company,
  config: TransitionConfig,
): PresenceState {
  const polygon = company.polygon;
  if (polygon && polygon.length >= 3) {
    return desiredPolygonState(current, fix, company, polygon);
  }
  return desiredCircularState(current, distance, company, fix.accuracy, config);
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
  company: Company,
  room: Room | null,
  fix: Fix,
  distance: number | null,
  source: EventSource,
): GeofenceEvent {
  return {
    idempotencyKey: `${state.targetId}:${state.transitionSeq}:${kind}`,
    kind,
    companyId: company.id,
    companyName: company.name,
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
  const { fix, companies, roomsByCompany, states, config, source } = input;

  if (fix.accuracy !== null && fix.accuracy > config.maxAccuracyMeters) {
    return { accepted: false, rejectionReason: 'inaccurate', events: [], changedStates: [] };
  }

  if (companies.length === 0) {
    return { accepted: true, rejectionReason: 'no_candidates', events: [], changedStates: [] };
  }

  const events: GeofenceEvent[] = [];
  const changedStates: TargetState[] = [];

  for (const company of companies) {
    if (!company.enabled) continue;

    const distance = distanceMeters(fix, company);
    const previous =
      states.get(company.id) ?? initialState(company.id, 'company', company.id, fix.timestamp);
    const desired = desiredCompanyState(previous.state, fix, distance, company, config);

    const result = applyObservation(previous, desired, distance, fix.timestamp, config);
    if (result.changed) changedStates.push(result.state);

    if (result.committed) {
      events.push(
        makeEvent(
          result.state.state === INSIDE ? 'company_enter' : 'company_exit',
          result.state,
          company,
          null,
          fix,
          distance,
          source,
        ),
      );
    }

    const rooms = roomsByCompany.get(company.id) ?? [];
    if (rooms.length === 0) continue;

    const insideCompany = result.state.state === INSIDE;

    const occupiedRoomId = insideCompany ? resolveOccupiedRoom(fix, rooms) : null;

    for (const room of rooms) {
      const roomPrevious =
        states.get(room.id) ?? initialState(room.id, 'room', company.id, fix.timestamp);

      const roomDesired = room.id === occupiedRoomId ? INSIDE : OUTSIDE;

      const roomResult = applyObservation(
        roomPrevious,
        roomDesired,
        null,
        fix.timestamp,
        insideCompany ? config : { ...config, confirmations: 1, minimumDwellMs: 0 },
      );

      if (roomResult.changed) changedStates.push(roomResult.state);

      if (roomResult.committed) {
        events.push(
          makeEvent(
            roomResult.state.state === INSIDE ? 'room_enter' : 'room_exit',
            roomResult.state,
            company,
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
