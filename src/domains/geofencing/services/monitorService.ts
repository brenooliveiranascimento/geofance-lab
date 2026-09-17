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
  getCompanyIndex,
  getRoomsByCompany,
  listEnabledCompanies,
} from './companyRepository';
import { regionsEqual, selectRegions } from './regionReconciler';
import { loadOccupiedCompanyIds, loadStatesFor, releaseAllPresence } from './stateRepository';
import { evaluateFix } from './transitionEngine';
import { GEOFENCING_TASK, LOCATION_TASK, MONITOR_CONFIG, MONITOR_KEYS } from '../config';
import type { EventSource, MonitorSnapshot, MonitorTier, NativeRegion, Company } from '../types';

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
const readActiveCompanies = (): string[] => readJson<string[]>(MONITOR_KEYS.activeCompanies) ?? [];

export function readSnapshot(): MonitorSnapshot {
  const activeCompanyIds = readActiveCompanies();
  const running = readRunning();

  let tier: MonitorTier = 'idle';
  if (running) tier = activeCompanyIds.length > 0 ? 'precise' : 'regions';

  return {
    running,
    tier,
    activeCompanyIds,
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

export async function rebuildRegions(origin: LatLng, force = false): Promise<NativeRegion[]> {
  const companies = listEnabledCompanies();

  const { regions, selected, guard, omittedCount } = selectRegions(companies, origin, {
    limit: MONITOR_CONFIG.maxNativeRegions,
    minRegionRadiusMeters: MONITOR_CONFIG.minNativeRegionRadiusMeters,
    minGuardRadiusMeters: MONITOR_CONFIG.minGuardRadiusMeters,
    guardIdentifier: MONITOR_CONFIG.guardRegionIdentifier,
  });

  if (regions.length === 0) {
    logger.warn(TAG, 'no companies to monitor');
    await stopGeofencing();
    writeJson(MONITOR_KEYS.regions, []);
    writeJson(MONITOR_KEYS.origin, origin);
    return [];
  }

  if (!force && regionsEqual(regions, readRegions())) {
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
    nearest: selected[0]?.company.name ?? null,
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

async function syncTier(activeCompanyIds: readonly string[]): Promise<void> {
  writeJson(MONITOR_KEYS.activeCompanies, [...activeCompanyIds]);

  if (activeCompanyIds.length > 0) await startPreciseUpdates();
  else await stopPreciseUpdates();
}

function candidateCompaniesFor(fix: Fix): Company[] {
  const index = getCompanyIndex();
  const searchRadius = getMaxActiveRadius();

  const nearby = queryWithinRadius(index, fix, searchRadius).map((result) => result.item);
  const seen = new Set(nearby.map((company) => company.id));

  const occupied = loadOccupiedCompanyIds().filter((id) => !seen.has(id));
  if (occupied.length === 0) return nearby;

  const byId = new Map(listEnabledCompanies().map((company) => [company.id, company]));
  for (const id of occupied) {
    const company = byId.get(id);
    if (company) nearby.push(company);
  }
  return nearby;
}

export async function evaluateAndCommit(fix: Fix, source: EventSource): Promise<string[]> {
  const companies = candidateCompaniesFor(fix);

  if (companies.length === 0) {
    writeJson(MONITOR_KEYS.lastFix, fix);
    writeJson(MONITOR_KEYS.lastEvaluatedAt, Date.now());
    return loadOccupiedCompanyIds();
  }

  const companyIds = companies.map((company) => company.id);
  const roomsByCompany = getRoomsByCompany(companyIds);

  const targetIds = [...companyIds];
  for (const rooms of roomsByCompany.values()) {
    for (const room of rooms) targetIds.push(room.id);
  }

  const result = evaluateFix({
    fix,
    companies,
    roomsByCompany,
    states: loadStatesFor(targetIds),
    config: TRANSITION_CONFIG,
    source,
  });

  writeJson(MONITOR_KEYS.lastFix, fix);
  writeJson(MONITOR_KEYS.lastEvaluatedAt, Date.now());

  if (!result.accepted) {
    logger.debug(TAG, 'fix rejected', { reason: result.rejectionReason, accuracy: fix.accuracy });
    return loadOccupiedCompanyIds();
  }

  const persisted = commitEvaluation(result.changedStates, result.events);

  if (persisted.length > 0) {
    logger.info(TAG, 'transitions committed', {
      events: persisted.map((event) => event.idempotencyKey),
    });
    await notifyEvents(persisted);
  }

  return loadOccupiedCompanyIds();
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

  const active = new Set(readActiveCompanies());

  if (isExit && !active.has(identifier)) {
    const known = loadStatesFor([identifier]).get(identifier);
    if (!known || known.state === 'outside') {
      logger.debug(TAG, 'exit for a region we were not inside, ignoring', {
        region: identifier,
      });
      return;
    }
  }

  logger.info(TAG, 'native region event', {
    region: identifier,
    type: isExit ? 'exit' : 'enter',
  });

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
  occupiedCompanyIds: readonly string[],
  justExited: string | null,
): string[] {
  const merged = new Set(fromRegions);
  for (const id of occupiedCompanyIds) merged.add(id);
  if (justExited && !occupiedCompanyIds.includes(justExited)) merged.delete(justExited);
  return [...merged];
}

export async function handleFixes(
  positions: readonly Location.LocationObject[],
  source: EventSource = 'location_update',
): Promise<void> {
  if (!readRunning() || positions.length === 0) return;

  const fixes = positions.map(toFix).sort((a, b) => a.timestamp - b.timestamp);

  let occupied: string[] = readActiveCompanies();
  for (const fix of fixes) {
    occupied = await evaluateAndCommit(fix, source);
  }

  await syncTier(occupied);
}

export async function submitSimulatedFix(fix: Fix): Promise<void> {
  const occupied = await evaluateAndCommit(fix, 'simulator');
  if (readRunning()) await syncTier(occupied);
}

export type StartFailure = 'permissions' | 'no_companies' | 'no_position';

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

  if (listEnabledCompanies().length === 0) {
    return { started: false, reason: 'no_companies' };
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
  writeJson(MONITOR_KEYS.activeCompanies, []);

  releaseAllPresence();

  logger.info(TAG, 'monitoring stopped');
}

export async function isGeofencingLive(): Promise<boolean> {
  try {
    return await Location.hasStartedGeofencingAsync(GEOFENCING_TASK);
  } catch {
    return false;
  }
}

export async function resumeMonitoringIfNeeded(): Promise<void> {
  if (!readRunning()) return;

  const permissions = await readPermissions();
  if (!isMonitoringAllowed(permissions)) {
    logger.warn(TAG, 'monitoring was on but the permission is gone, standing down', permissions);
    await stopMonitoring();
    return;
  }

  if (await isGeofencingLive()) {
    logger.debug(TAG, 'platform still holds the region window');
    return;
  }

  // The platform dropped the registrations — a reinstall, a reboot, or the OS
  // evicting them. Our own flag still says "running", so without this the app
  // would show itself as monitoring while nothing was armed.
  logger.warn(TAG, 're-arming the region window after relaunch');

  const fix = (await getCurrentFix()) ?? readJson<Fix>(MONITOR_KEYS.lastFix);
  if (!fix) {
    logger.warn(TAG, 'cannot re-arm without a position');
    return;
  }

  await rebuildRegions(fix, true);
  const occupied = await evaluateAndCommit(fix, 'initial_sync');
  await syncTier(occupied);
}

export async function refreshMonitoring(): Promise<void> {
  if (!readRunning()) return;
  const fix = (await getCurrentFix()) ?? readJson<Fix>(MONITOR_KEYS.lastFix);
  if (!fix) return;
  await rebuildRegions(fix);
  const occupied = await evaluateAndCommit(fix, 'initial_sync');
  await syncTier(occupied);
}
