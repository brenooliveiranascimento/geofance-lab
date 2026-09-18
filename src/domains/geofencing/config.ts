import { Platform } from 'react-native';

export const MONITOR_CONFIG = {
  maxNativeRegions: Platform.OS === 'ios' ? 20 : 100,

  minNativeRegionRadiusMeters: 100,

  guardRegionIdentifier: '__guard__',

  minGuardRadiusMeters: 200,

  maxGuardRadiusMeters: 100_000,

  maxAccuracyMeters: 100,

  maxAccuracyMarginRatio: 0.5,

  confirmations: 2,

  minimumDwellMs: 10_000,

  preciseUpdates: {
    distanceIntervalMeters: 3,
    timeIntervalMs: 4_000,
  },
} as const;

export const COMPANY_SHAPE = {
  exitBufferMeters: 25,
  minVertices: 3,
  minCompanyAreaSquareMeters: 20,
  minRoomAreaSquareMeters: 2,
  minVertexSpacingMeters: 0.5,
} as const;

export const MONITOR_KEYS = {
  running: 'monitor.running',
  origin: 'monitor.origin',
  regions: 'monitor.regions',
  activeCompanies: 'monitor.activeCompanies',
  lastFix: 'monitor.lastFix',
  lastEvaluatedAt: 'monitor.lastEvaluatedAt',
} as const;

export const GEOFENCING_TASK = 'geofence-lab.regions';
export const LOCATION_TASK = 'geofence-lab.location';
