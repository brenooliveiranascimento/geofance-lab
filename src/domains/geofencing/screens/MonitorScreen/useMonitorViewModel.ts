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
import { useCompanyStates } from '../../queries/useCompanyStates';
import { useCompanies } from '../../queries/useCompanies';
import { getCompanyIndex, getRoomsByCompany } from '../../services/companyRepository';
import { startMonitoring, stopMonitoring } from '../../services/monitorService';
import type { GeofenceEvent, MonitorSnapshot, Company, Room, TargetState } from '../../types';

const MAP_COMPANY_LIMIT = 40;

export type MonitorStatus = 'idle' | 'regions' | 'precise' | 'blocked' | 'busy';

export interface MonitorViewModel {
  status: MonitorStatus;
  statusTitle: string;
  statusMessage: string;
  snapshot: MonitorSnapshot | undefined;
  totalCompanies: number;
  insideNames: string[];
  center: LatLng | null;
  mapCompanies: Company[];
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
  const { data: companies = [] } = useCompanies();
  const { data: states = new Map<string, TargetState>() } = useCompanyStates();
  const { data: recentEvents = [] } = useEvents({ limit: 5 });

  const center = snapshot?.lastFix ?? snapshot?.origin ?? null;

  const mapCompanies = useMemo(() => {
    if (!center || companies.length === 0) return [];
    return queryNearest(getCompanyIndex(), center, MAP_COMPANY_LIMIT).map((result) => result.item);
  }, [center, companies.length]);

  const mapRooms = useMemo(() => {
    if (mapCompanies.length === 0) return [];
    const grouped = getRoomsByCompany(mapCompanies.map((company) => company.id));
    return [...grouped.values()].flat();
  }, [mapCompanies]);

  const insideNames = useMemo(() => {
    const names: string[] = [];
    for (const state of states.values()) {
      if (state.state !== 'inside') continue;
      if (state.targetKind === 'company') {
        names.push(companies.find((company) => company.id === state.targetId)?.name ?? state.targetId);
      }
    }
    return names;
  }, [states, companies]);

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
        ? t('monitor.status.precise.message', { total: snapshot?.activeCompanyIds.length ?? 0 })
        : status === 'regions'
          ? t('monitor.status.regions.message', { total: snapshot?.regionCount ?? 0 })
          : t(`monitor.status.${status}.message`),
    snapshot,
    totalCompanies: companies.length,
    insideNames,
    center,
    mapCompanies,
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
