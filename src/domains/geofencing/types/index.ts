import type { Fix, LatLng, Ring } from '@src/core/geo';

/**
 * A monitored location. Matches the structure given in the exercise brief:
 * `radius` is the entry threshold and `activeRadius` the exit threshold, and the
 * gap between them is the dead band that stops a user standing on the edge from
 * producing an endless enter/exit stream.
 */
export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  activeRadius: number;
  /** Optional footprint of the residence. Null for a plain circular place. */
  polygon: Ring | null;
  enabled: boolean;
  createdAt: number;
}

/** A sub-polygon inside a place — a room. */
export interface Room {
  id: string;
  placeId: string;
  name: string;
  polygon: Ring;
  createdAt: number;
}

export type MonitorTargetKind = 'place' | 'room';
export type PresenceState = 'inside' | 'outside';

/**
 * Persisted presence of one target.
 *
 * `transitionSeq` is the load-bearing field: it increments on every committed
 * flip and becomes part of the event's idempotency key, so the same transition
 * can never be recorded twice even if the process dies between the write and
 * the notification.
 */
export interface TargetState {
  targetId: string;
  targetKind: MonitorTargetKind;
  placeId: string;
  state: PresenceState;
  transitionSeq: number;
  /** When the current state was entered. Also the dwell-time anchor. */
  since: number;
  lastDistance: number | null;
  /** Candidate flip awaiting confirmation, and how many fixes have agreed. */
  pendingState: PresenceState | null;
  pendingCount: number;
  updatedAt: number;
}

export type GeofenceEventKind = 'place_enter' | 'place_exit' | 'room_enter' | 'room_exit';

export type EventSource =
  | 'native_region'
  | 'location_update'
  | 'simulator'
  | 'initial_sync';

export interface GeofenceEvent {
  id?: number;
  idempotencyKey: string;
  kind: GeofenceEventKind;
  placeId: string;
  placeName: string;
  roomId: string | null;
  roomName: string | null;
  occurredAt: number;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  distance: number | null;
  source: EventSource;
  notified: boolean;
}

/** A circular region handed to the platform's native region monitoring. */
export interface NativeRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

/** The two-tier monitoring posture. */
export type MonitorTier = 'idle' | 'regions' | 'precise';

export interface MonitorSnapshot {
  running: boolean;
  tier: MonitorTier;
  activePlaceIds: string[];
  regionCount: number;
  lastFix: Fix | null;
  lastEvaluatedAt: number | null;
  origin: LatLng | null;
}
