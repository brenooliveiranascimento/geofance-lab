import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { queryNearest, type LatLng } from '@src/core/geo';
import { requestMonitoringPermissions } from '@src/core/permissions';
import { useToast } from '@src/lib/toast';

import { isMapAvailable } from '../../mapAvailability';
import { invalidateGeofencingData, invalidatePermissions } from '../../queries/invalidate';
import { MAP_CONFIG } from '../../config';
import { useCompanies } from '../../queries/useCompanies';
import { useCompanyStates } from '../../queries/useCompanyStates';
import { useEvents } from '../../queries/useEvents';
import { useMonitorSnapshot } from '../../queries/useMonitorSnapshot';
import { usePermissions } from '../../queries/usePermissions';
import { getCompanyIndex, getRoomsByCompany } from '../../services/companyRepository';
import {
  getApproximateFix,
  startMonitoring,
  stopMonitoring,
} from '../../services/monitorService';
import type { Company, GeofenceEvent, MonitorSnapshot, Room, TargetState } from '../../types';


export type MonitorStatus = 'idle' | 'regions' | 'precise' | 'blocked' | 'busy' | 'empty';

export interface MonitorViewModel {
  status: MonitorStatus;
  statusLabel: string;
  statusDetail: string;
  snapshot: MonitorSnapshot | undefined;
  totalCompanies: number;
  insideName: string | null;
  center: LatLng | null;
  mapCompanies: Company[];
  mapRooms: Room[];
  mapFocus: LatLng | null;
  mapSpanMeters: number;
  states: Map<string, TargetState>;
  lastEvent: GeofenceEvent | null;
  mapAvailable: boolean;
  busy: boolean;
  needsPermission: boolean;
  running: boolean;
  toggleMonitoring: () => Promise<void>;
  grantPermissions: () => Promise<void>;
  openSettings: () => void;
  openSimulator: () => void;
  openHistory: () => void;
  openCompanies: () => void;
  recenter: () => Promise<LatLng | null>;
}

export function useMonitorViewModel(): MonitorViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data: snapshot } = useMonitorSnapshot();
  const { data: permissions } = usePermissions();
  const { data: companies = [] } = useCompanies();
  const { data: states = new Map<string, TargetState>() } = useCompanyStates();
  const { data: recent = [] } = useEvents({ limit: 1 });

  const [deviceCenter, setDeviceCenter] = useState<LatLng | null>(null);

  const center = snapshot?.lastFix ?? snapshot?.origin ?? companies[0] ?? deviceCenter ?? null;

  const hasAnchor = Boolean(snapshot?.lastFix ?? snapshot?.origin ?? companies[0]);

  useEffect(() => {
    if (hasAnchor || deviceCenter) return;

    let cancelled = false;
    void (async () => {
      const fix = await getApproximateFix();
      if (cancelled || !fix) return;
      setDeviceCenter({ latitude: fix.latitude, longitude: fix.longitude });
    })();

    return () => {
      cancelled = true;
    };
  }, [hasAnchor, deviceCenter]);

  const mapCompanies = useMemo(() => {
    if (!center || companies.length === 0) return [];
    return queryNearest(
      getCompanyIndex(),
      center,
      MAP_CONFIG.companyLimit,
      MAP_CONFIG.nearestSearchRadiusMeters,
    ).map((r) => r.item);
  }, [center, companies.length]);

  const mapFocus = mapCompanies[0] ?? center;

  const mapSpanMeters = useMemo(() => {
    const nearest = mapCompanies[0];
    if (!nearest) return MAP_CONFIG.spanMaxMeters;
    const span = nearest.activeRadius * 5;
    return Math.min(Math.max(span, MAP_CONFIG.spanMinMeters), MAP_CONFIG.spanMaxMeters);
  }, [mapCompanies]);

  const mapRooms = useMemo(() => {
    if (mapCompanies.length === 0) return [];
    return [...getRoomsByCompany(mapCompanies.map((c) => c.id)).values()].flat();
  }, [mapCompanies]);

  const insideName = useMemo(() => {
    for (const state of states.values()) {
      if (state.state !== 'inside') continue;
      if (state.targetKind === 'room') {
        const room = mapRooms.find((r) => r.id === state.targetId);
        if (room) return room.name;
      }
    }
    for (const state of states.values()) {
      if (state.state === 'inside' && state.targetKind === 'company') {
        const company = companies.find((c) => c.id === state.targetId);
        if (company?.enabled) return company.name;
      }
    }
    return null;
  }, [states, companies, mapRooms]);

  const needsPermission = permissions
    ? permissions.foregroundLocation !== 'granted' ||
      permissions.backgroundLocation !== 'granted' ||
      !permissions.locationServicesEnabled
    : false;

  const running = snapshot?.running ?? false;

  const status: MonitorStatus = busy
    ? 'busy'
    : companies.length === 0
      ? 'empty'
      : needsPermission && !running
        ? 'blocked'
        : (snapshot?.tier ?? 'idle');

  const toggleMonitoring = useCallback(async () => {
    setBusy(true);
    try {
      if (running) {
        await stopMonitoring();
      } else {
        const result = await startMonitoring();
        if (!result.started) {
          toast.show({ message: t(`monitor.startFailed.${result.reason ?? 'permissions'}`) });
        }
      }
    } finally {
      setBusy(false);
      invalidateGeofencingData();
      invalidatePermissions();
    }
  }, [running, t, toast]);

  const detail = useMemo(() => {
    switch (status) {
      case 'empty':
        return t('monitor.detail.empty');
      case 'blocked':
        return t('monitor.detail.blocked');
      case 'busy':
        return '';
      case 'precise':
        return insideName ?? t('monitor.detail.precise');
      case 'regions':
        return t('monitor.detail.regions', { count: snapshot?.regionCount ?? 0 });
      default:
        return t('monitor.detail.idle', { count: companies.length });
    }
  }, [status, insideName, snapshot?.regionCount, companies.length, t]);

  return {
    status,
    statusLabel: t(`monitor.label.${status}`),
    statusDetail: detail,
    snapshot,
    totalCompanies: companies.length,
    insideName,
    center,
    mapCompanies,
    mapRooms,
    mapFocus,
    mapSpanMeters,
    states,
    lastEvent: recent[0] ?? null,
    mapAvailable: isMapAvailable,
    busy,
    needsPermission,
    running,
    toggleMonitoring,
    grantPermissions: async () => {
      await requestMonitoringPermissions();
      invalidatePermissions();
    },
    openSettings: () => void Linking.openSettings(),
    openSimulator: () => router.push('/simulator'),
    openHistory: () => router.push('/history'),
    openCompanies: () => router.push('/(tabs)/companies'),
    recenter: async () => {
      const fix = await getApproximateFix();
      if (!fix) return null;
      const point = { latitude: fix.latitude, longitude: fix.longitude };
      setDeviceCenter(point);
      return point;
    },
  };
}
