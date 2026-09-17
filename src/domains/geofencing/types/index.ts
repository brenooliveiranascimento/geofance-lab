import type { Fix, LatLng, Ring } from '@src/core/geo';

export interface Company {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  activeRadius: number;
  polygon: Ring | null;
  enabled: boolean;
  createdAt: number;
}

export interface Room {
  id: string;
  companyId: string;
  name: string;
  polygon: Ring;
  createdAt: number;
}

export type MonitorTargetKind = 'company' | 'room';
export type PresenceState = 'inside' | 'outside';

export interface TargetState {
  targetId: string;
  targetKind: MonitorTargetKind;
  companyId: string;
  state: PresenceState;
  transitionSeq: number;
  since: number;
  lastDistance: number | null;
  pendingState: PresenceState | null;
  pendingCount: number;
  updatedAt: number;
}

export type GeofenceEventKind = 'company_enter' | 'company_exit' | 'room_enter' | 'room_exit';

export type EventSource =
  | 'native_region'
  | 'location_update'
  | 'simulator'
  | 'initial_sync';

export interface GeofenceEvent {
  id?: number;
  idempotencyKey: string;
  kind: GeofenceEventKind;
  companyId: string;
  companyName: string;
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

export interface NativeRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export type MonitorTier = 'idle' | 'regions' | 'precise';

export interface MonitorSnapshot {
  running: boolean;
  tier: MonitorTier;
  activeCompanyIds: string[];
  regionCount: number;
  lastFix: Fix | null;
  lastEvaluatedAt: number | null;
  origin: LatLng | null;
}
