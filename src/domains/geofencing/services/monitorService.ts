import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { readJson, writeJson } from '@src/core/db';
import { queryWithinRadius, type Fix, type LatLng } from '@src/core/geo';
import { logger } from '@src/core/logger';
import { isMonitoringAllowed, readPermissions } from '@src/core/permissions';

import { commitEvaluation } from './eventRepository';
import { notifyEvents } from './notifier';
import {
  getMaxActiveRadius,
  getPlaceIndex,
  getRoomsByPlace,
  listEnabledPlaces,
} from './placeRepository';
import { regionsEqual, selectRegions } from './regionReconciler';
import { loadOccupiedPlaceIds, loadStatesFor, releaseAllPresence } from './stateRepository';
import { evaluateFix } from './transitionEngine';
import { GEOFENCING_TASK, LOCATION_TASK, MONITOR_CONFIG, MONITOR_KEYS } from '../config';
import type { EventSource, MonitorSnapshot, MonitorTier, NativeRegion, Place } from '../types';

const TAG = 'monitor';

const TRANSITION_CONFIG = {
  maxAccuracyMeters: MONITOR_CONFIG.maxAccuracyMeters,
  maxAccuracyMarginRatio: MONITOR_CONFIG.maxAccuracyMarginRatio,
  confirmations: MONITOR_CONFIG.confirmations,
  minimumDwellMs: MONITOR_CONFIG.minimumDwellMs,
};

const readRunning = (): boolean => readJson<boolean>(MONITOR_KEYS.running) ?? false;
const readOrigin = (): LatLng | null => readJson<LatLng>(MONITOR_KEYS.origin);
const readRegions = (): NativeRegion[] => readJson<NativeRegion[]>(MONITOR_KEYS.regions) ?? [];
const readActivePlaces = (): string[] => readJson<string[]>(MONITOR_KEYS.activePlaces) ?? [];

export function readSnapshot(): MonitorSnapshot {
  const activePlaceIds = readActivePlaces();
  const running = readRunning();

  let tier: MonitorTier = 'idle';
  if (running) tier = activePlaceIds.length > 0 ? 'precise' : 'regions';

  return {
    running,
    tier,
    activePlaceIds,
    regionCount: readRegions().length,
    lastFix: readJson<Fix>(MONITOR_KEYS.lastFix),
    lastEvaluatedAt: readJson<number>(MONITOR_KEYS.lastEvaluatedAt),
    origin: readOrigin(),
  };
}

const toFix = (position: Location.LocationObject): Fix => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy ?? null,
  timestamp: position.timestamp,
});

export async function getCurrentFix(): Promise<Fix | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return toFix(position);
  } catch (error) {
    logger.warn(TAG, 'current position unavailable, falling back to last known', {
      error: String(error),
    });
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
      return last ? toFix(last) : null;
    } catch {
      return null;
    }
  }
}

export async function rebuildRegions(origin: LatLng): Promise<NativeRegion[]> {
  const places = listEnabledPlaces();

  const { regions, selected, guard, omittedCount } = selectRegions(places, origin, {
    limit: MONITOR_CONFIG.maxNativeRegions,
    minRegionRadiusMeters: MONITOR_CONFIG.minNativeRegionRadiusMeters,
    minGuardRadiusMeters: MONITOR_CONFIG.minGuardRadiusMeters,
    guardIdentifier: MONITOR_CONFIG.guardRegionIdentifier,
  });

  if (regions.length === 0) {
    logger.warn(TAG, 'no places to monitor');
    await stopGeofencing();
    writeJson(MONITOR_KEYS.regions, []);
    writeJson(MONITOR_KEYS.origin, origin);
    return [];
  }

  if (regionsEqual(regions, readRegions())) {
    logger.debug(TAG, 'region window unchanged, skipping re-registration');
    writeJson(MONITOR_KEYS.origin, origin);
    return regions;
  }

  await Location.startGeofencingAsync(GEOFENCING_TASK, regions);

  writeJson(MONITOR_KEYS.regions, regions);
  writeJson(MONITOR_KEYS.origin, origin);

  logger.info(TAG, 'region window rebuilt', {
    monitored: selected.length,
    omitted: omittedCount,
    guardRadius: guard ? Math.round(guard.radius) : null,
    nearest: selected[0]?.place.name ?? null,
  });

  return regions;
}

async function stopGeofencing(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCING_TASK);
    }
  } catch (error) {
    logger.warn(TAG, 'stopGeofencing failed', { error: String(error) });
  }
}

async function isLocationTaskRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

async function startPreciseUpdates(): Promise<void> {
  if (await isLocationTaskRunning()) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: MONITOR_CONFIG.preciseUpdates.distanceIntervalMeters,
    timeInterval: MONITOR_CONFIG.preciseUpdates.timeIntervalMs,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Geofence Lab',
      notificationBody: 'Monitorando os cômodos do local em que você está',
      notificationColor: '#2563EB',
    },
  });

  logger.info(TAG, 'precise updates started');
}

async function stopPreciseUpdates(): Promise<void> {
  try {
    if (await isLocationTaskRunning()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      logger.info(TAG, 'precise updates stopped');
    }
  } catch (error) {
    logger.warn(TAG, 'stopLocationUpdates failed', { error: String(error) });
  }
}

async function syncTier(activePlaceIds: readonly string[]): Promise<void> {
  writeJson(MONITOR_KEYS.activePlaces, [...activePlaceIds]);

  if (activePlaceIds.length > 0) await startPreciseUpdates();
  else await stopPreciseUpdates();
}

function candidatePlacesFor(fix: Fix): Place[] {
  const index = getPlaceIndex();
  const searchRadius = getMaxActiveRadius();

  const nearby = queryWithinRadius(index, fix, searchRadius).map((result) => result.item);
  const seen = new Set(nearby.map((place) => place.id));

  const occupied = loadOccupiedPlaceIds().filter((id) => !seen.has(id));
  if (occupied.length === 0) return nearby;

  const byId = new Map(listEnabledPlaces().map((place) => [place.id, place]));
  for (const id of occupied) {
    const place = byId.get(id);
    if (place) nearby.push(place);
  }
  return nearby;
}

export async function evaluateAndCommit(fix: Fix, source: EventSource): Promise<string[]> {
  const places = candidatePlacesFor(fix);

  if (places.length === 0) {
    writeJson(MONITOR_KEYS.lastFix, fix);
    writeJson(MONITOR_KEYS.lastEvaluatedAt, Date.now());
    return loadOccupiedPlaceIds();
  }

  const placeIds = places.map((place) => place.id);
  const roomsByPlace = getRoomsByPlace(placeIds);

  const targetIds = [...placeIds];
  for (const rooms of roomsByPlace.values()) {
    for (const room of rooms) targetIds.push(room.id);
  }

  const result = evaluateFix({
    fix,
    places,
    roomsByPlace,
    states: loadStatesFor(targetIds),
    config: TRANSITION_CONFIG,
    source,
  });

  writeJson(MONITOR_KEYS.lastFix, fix);
  writeJson(MONITOR_KEYS.lastEvaluatedAt, Date.now());

  if (!result.accepted) {
    logger.debug(TAG, 'fix rejected', { reason: result.rejectionReason, accuracy: fix.accuracy });
    return loadOccupiedPlaceIds();
  }

  const persisted = commitEvaluation(result.changedStates, result.events);

  if (persisted.length > 0) {
    logger.info(TAG, 'transitions committed', {
      events: persisted.map((event) => event.idempotencyKey),
    });
    await notifyEvents(persisted);
  }

  return loadOccupiedPlaceIds();
}

export async function handleRegionEvent(
  eventType: Location.GeofencingEventType,
  region: Location.LocationRegion,
): Promise<void> {
  if (!readRunning()) return;

  const identifier = region.identifier;
  if (!identifier) {
    logger.warn(TAG, 'region event without an identifier, ignoring');
    return;
  }

  const isExit = eventType === Location.GeofencingEventType.Exit;

  if (identifier === MONITOR_CONFIG.guardRegionIdentifier) {
    if (!isExit) return;
    logger.info(TAG, 'guard region left, recomputing window');
    const fix = await getCurrentFix();
    if (fix) {
      await rebuildRegions(fix);
      await evaluateAndCommit(fix, 'native_region');
    }
    return;
  }

  logger.info(TAG, 'native region event', {
    region: identifier,
    type: isExit ? 'exit' : 'enter',
  });

  const active = new Set(readActivePlaces());
  if (isExit) active.delete(identifier);
  else active.add(identifier);

  await syncTier([...active]);

  const fix = await getCurrentFix();
  if (fix) {
    const occupied = await evaluateAndCommit(fix, 'native_region');
    await syncTier(mergeActive(active, occupied, isExit ? identifier : null));
  }
}

function mergeActive(
  fromRegions: ReadonlySet<string>,
  occupiedPlaceIds: readonly string[],
  justExited: string | null,
): string[] {
  const merged = new Set(fromRegions);
  for (const id of occupiedPlaceIds) merged.add(id);
  if (justExited && !occupiedPlaceIds.includes(justExited)) merged.delete(justExited);
  return [...merged];
}

export async function handleFixes(
  positions: readonly Location.LocationObject[],
  source: EventSource = 'location_update',
): Promise<void> {
  if (!readRunning() || positions.length === 0) return;

  const fixes = positions.map(toFix).sort((a, b) => a.timestamp - b.timestamp);

  let occupied: string[] = readActivePlaces();
  for (const fix of fixes) {
    occupied = await evaluateAndCommit(fix, source);
  }

  await syncTier(occupied);
}

export async function submitSimulatedFix(fix: Fix): Promise<void> {
  const occupied = await evaluateAndCommit(fix, 'simulator');
  if (readRunning()) await syncTier(occupied);
}

export type StartFailure = 'permissions' | 'no_places' | 'no_position';

export interface StartResult {
  started: boolean;
  reason?: StartFailure;
  regionCount?: number;
}

export async function startMonitoring(): Promise<StartResult> {
  const permissions = await readPermissions();
  if (!isMonitoringAllowed(permissions)) {
    logger.warn(TAG, 'cannot start without background location', permissions);
    return { started: false, reason: 'permissions' };
  }

  if (listEnabledPlaces().length === 0) {
    return { started: false, reason: 'no_places' };
  }

  const fix = await getCurrentFix();
  if (!fix) return { started: false, reason: 'no_position' };

  writeJson(MONITOR_KEYS.running, true);

  const regions = await rebuildRegions(fix);

  const occupied = await evaluateAndCommit(fix, 'initial_sync');
  await syncTier(occupied);

  logger.info(TAG, 'monitoring started', { regions: regions.length, occupied });
  return { started: true, regionCount: regions.length };
}

export async function stopMonitoring(): Promise<void> {
  writeJson(MONITOR_KEYS.running, false);

  await stopGeofencing();
  await stopPreciseUpdates();

  writeJson(MONITOR_KEYS.regions, []);
  writeJson(MONITOR_KEYS.activePlaces, []);

  releaseAllPresence();

  logger.info(TAG, 'monitoring stopped');
}

export async function refreshMonitoring(): Promise<void> {
  if (!readRunning()) return;
  const fix = (await getCurrentFix()) ?? readJson<Fix>(MONITOR_KEYS.lastFix);
  if (!fix) return;
  await rebuildRegions(fix);
  const occupied = await evaluateAndCommit(fix, 'initial_sync');
  await syncTier(occupied);
}
