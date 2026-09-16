import { Platform } from 'react-native';

/**
 * Tuning knobs for the monitor. Every value here is a battery/accuracy trade-off
 * and is explained in the README.
 */
export const MONITOR_CONFIG = {
  /**
   * Hard platform ceiling on simultaneously monitored regions: CoreLocation
   * allows 20, the Android Geofencing API 100. The dataset is 500+, so the
   * reconciler keeps a moving window of the nearest ones.
   */
  maxNativeRegions: Platform.OS === 'ios' ? 20 : 100,

  /**
   * CLCircularRegion stops firing reliably below roughly 100 m, and Android's
   * own guidance is not to go under ~100 m either. Native radii are clamped up
   * to this floor; the real `radius`/`activeRadius` are then resolved in JS from
   * actual fixes, which is also what makes room-sized polygons possible at all.
   */
  minNativeRegionRadiusMeters: 100,

  /** Reserved identifier of the region that guards the nearest-set's freshness. */
  guardRegionIdentifier: '__guard__',

  /** Floor for the guard region, so a dense cluster cannot produce a tiny one. */
  minGuardRadiusMeters: 200,

  /** Readings worse than this are discarded rather than acted on. */
  maxAccuracyMeters: 100,

  /**
   * The reported accuracy is used as a confidence margin: we only claim entry
   * once the whole error circle is inside, and only claim exit once it is fully
   * outside. Capped at this fraction of the radius so a poor fix cannot make a
   * small geofence impossible to enter.
   */
  maxAccuracyMarginRatio: 0.5,

  /** Consecutive agreeing fixes required before a flip commits. */
  confirmations: 2,

  /** A committed state holds for at least this long before it can flip back. */
  minimumDwellMs: 10_000,

  /** Precise tier: what we ask the platform for while inside a place. */
  preciseUpdates: {
    distanceIntervalMeters: 3,
    timeIntervalMs: 4_000,
  },

  /** How many neighbours the spatial index returns when rebuilding the set. */
  get nearestCandidateCount(): number {
    return this.maxNativeRegions * 2;
  },
} as const;

/** kv keys owned by the geofencing domain. */
export const MONITOR_KEYS = {
  running: 'monitor.running',
  origin: 'monitor.origin',
  regions: 'monitor.regions',
  activePlaces: 'monitor.activePlaces',
  lastFix: 'monitor.lastFix',
  lastEvaluatedAt: 'monitor.lastEvaluatedAt',
} as const;

/** TaskManager task names. Must be stable across releases. */
export const GEOFENCING_TASK = 'geofence-lab.regions';
export const LOCATION_TASK = 'geofence-lab.location';
