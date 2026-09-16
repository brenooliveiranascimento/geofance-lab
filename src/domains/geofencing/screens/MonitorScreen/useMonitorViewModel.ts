import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform } from 'react-native';

import { queryNearest, type LatLng } from '@src/core/geo';
import { requestMonitoringPermissions } from '@src/core/permissions';
import { useToast } from '@src/lib/toast';

import { isMapAvailable } from '../../mapAvailability';
import { invalidateGeofencingData, invalidatePermissions } from '../../queries/invalidate';
import { useEvents } from '../../queries/useEvents';
import { useMonitorSnapshot } from '../../queries/useMonitorSnapshot';
import { usePermissions } from '../../queries/usePermissions';
import { usePlaceStates } from '../../queries/usePlaceStates';
import { usePlaces } from '../../queries/usePlaces';
import { getPlaceIndex, getRoomsByPlace } from '../../services/placeRepository';
import { startMonitoring, stopMonitoring } from '../../services/monitorService';
import type { GeofenceEvent, MonitorSnapshot, Place, Room, TargetState } from '../../types';

/** Rendering 520 circles would stall the map; the nearest few tell the story. */
const MAP_PLACE_LIMIT = 40;

export type MonitorStatus = 'idle' | 'regions' | 'precise' | 'blocked' | 'busy';

export interface MonitorViewModel {
  status: MonitorStatus;
  statusTitle: string;
  statusMessage: string;
  snapshot: MonitorSnapshot | undefined;
  totalPlaces: number;
  insideNames: string[];
  center: LatLng | null;
  mapPlaces: Place[];
  mapRooms: Room[];
  states: Map<string, TargetState>;
  recentEvents: GeofenceEvent[];
  mapAvailable: boolean;
  busy: boolean;
  needsPermission: boolean;
  toggleMonitoring: () => Promise<void>;
  grantPermissions: () => Promise<void>;
  openSystemSettings: () => void;
  openSimulator: () => void;
}

export function useMonitorViewModel(): MonitorViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data: snapshot } = useMonitorSnapshot();
  const { data: permissions } = usePermissions();
  const { data: places = [] } = usePlaces();
  const { data: states = new Map<string, TargetState>() } = usePlaceStates();
  const { data: recentEvents = [] } = useEvents({ limit: 5 });

  const center = snapshot?.lastFix ?? snapshot?.origin ?? null;

  // Recomputed from the map centre rather than from the full list, so the map
  // stays responsive with the full 520-place dataset loaded.
  const mapPlaces = useMemo(() => {
    if (!center || places.length === 0) return [];
    return queryNearest(getPlaceIndex(), center, MAP_PLACE_LIMIT).map((result) => result.item);
  }, [center, places.length]);

  const mapRooms = useMemo(() => {
    if (mapPlaces.length === 0) return [];
    const grouped = getRoomsByPlace(mapPlaces.map((place) => place.id));
    return [...grouped.values()].flat();
  }, [mapPlaces]);

  const insideNames = useMemo(() => {
    const names: string[] = [];
    for (const state of states.values()) {
      if (state.state !== 'inside') continue;
      if (state.targetKind === 'place') {
        names.push(places.find((place) => place.id === state.targetId)?.name ?? state.targetId);
      }
    }
    return names;
  }, [states, places]);

  const needsPermission = permissions
    ? permissions.foregroundLocation !== 'granted' ||
      permissions.backgroundLocation !== 'granted' ||
      !permissions.locationServicesEnabled
    : false;

  const status: MonitorStatus = busy
    ? 'busy'
    : needsPermission && !snapshot?.running
      ? 'blocked'
      : (snapshot?.tier ?? 'idle');

  const toggleMonitoring = useCallback(async () => {
    setBusy(true);
    try {
      if (snapshot?.running) {
        await stopMonitoring();
        toast.show({ message: t('monitor.stopped') });
      } else {
        const result = await startMonitoring();
        if (!result.started) {
          toast.show({ message: t(`monitor.startFailed.${result.reason ?? 'permissions'}`) });
        } else {
          toast.show({ message: t('monitor.started', { regions: result.regionCount ?? 0 }) });
        }
      }
    } finally {
      setBusy(false);
      invalidateGeofencingData();
      invalidatePermissions();
    }
  }, [snapshot?.running, t, toast]);

  const grantPermissions = useCallback(async () => {
    await requestMonitoringPermissions();
    invalidatePermissions();
  }, []);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return {
    status,
    statusTitle: t(`monitor.status.${status}.title`),
    statusMessage:
      status === 'precise'
        ? t('monitor.status.precise.message', { total: snapshot?.activePlaceIds.length ?? 0 })
        : status === 'regions'
          ? t('monitor.status.regions.message', { total: snapshot?.regionCount ?? 0 })
          : t(`monitor.status.${status}.message`),
    snapshot,
    totalPlaces: places.length,
    insideNames,
    center,
    mapPlaces,
    mapRooms,
    states,
    recentEvents,
    mapAvailable: isMapAvailable,
    busy,
    needsPermission,
    toggleMonitoring,
    grantPermissions,
    openSystemSettings: Platform.OS === 'web' ? () => {} : openSystemSettings,
    openSimulator: () => router.push('/simulator'),
  };
}
