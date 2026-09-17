import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Fix } from '@src/core/geo';
import { useToast } from '@src/lib/toast';

import { invalidateGeofencingData } from '../../queries/invalidate';
import { useMonitorSnapshot } from '../../queries/useMonitorSnapshot';
import { useCompanies } from '../../queries/useCompanies';
import { submitSimulatedFix } from '../../services/monitorService';
import {
  DEFAULT_ROUTE_OPTIONS,
  buildApproachRoute,
  buildCrossingRoute,
} from '../../services/routeSimulator';
import type { Company } from '../../types';

export type RouteKind = 'crossing' | 'approach';

const PLAYBACK_INTERVAL_MS = 120;

export interface SimulatorViewModel {
  companies: Company[];
  selected: Company | null;
  selectCompany: (company: Company) => void;
  routeKind: RouteKind;
  setRouteKind: (kind: RouteKind) => void;
  accuracy: number;
  setAccuracy: (value: number) => void;
  running: boolean;
  progress: number;
  routeLength: number;
  monitoringActive: boolean;
  start: () => void;
  stop: () => void;
  goBack: () => void;
}

export function useSimulatorViewModel(): SimulatorViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  const { data: allCompanies = [] } = useCompanies();
  const { data: snapshot } = useMonitorSnapshot();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeKind, setRouteKind] = useState<RouteKind>('crossing');
  const [accuracy, setAccuracy] = useState(DEFAULT_ROUTE_OPTIONS.accuracy);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const cancelled = useRef(false);

  const companies = useMemo(() => {
    const residences = allCompanies.filter((company) => company.polygon !== null);
    const others = allCompanies.filter((company) => company.polygon === null).slice(0, 30);
    return [...residences, ...others];
  }, [allCompanies]);

  const selected = useMemo(
    () => companies.find((company) => company.id === selectedId) ?? companies[0] ?? null,
    [companies, selectedId],
  );

  const route = useMemo<Fix[]>(() => {
    if (!selected) return [];
    const options = { ...DEFAULT_ROUTE_OPTIONS, accuracy, endAt: Date.now() };
    return routeKind === 'crossing'
      ? buildCrossingRoute(selected, options)
      : buildApproachRoute(selected, options);
  }, [selected, routeKind, accuracy]);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  const start = useCallback(() => {
    if (!selected || route.length === 0 || running) return;

    cancelled.current = false;
    setRunning(true);
    setProgress(0);

    void (async () => {
      try {
        for (let index = 0; index < route.length; index += 1) {
          if (cancelled.current) break;

          await submitSimulatedFix(route[index]);
          setProgress(index + 1);

          await new Promise((resolve) => setTimeout(resolve, PLAYBACK_INTERVAL_MS));
        }
      } finally {
        setRunning(false);
        invalidateGeofencingData();
        if (!cancelled.current) toast.show({ message: t('simulator.finished'), type: 'success' });
      }
    })();
  }, [selected, route, running, t, toast]);

  const stop = useCallback(() => {
    cancelled.current = true;
    setRunning(false);
  }, []);

  const selectCompany = useCallback(
    (company: Company) => {
      if (running) return;
      setSelectedId(company.id);
      setProgress(0);
    },
    [running],
  );

  return {
    companies,
    selected,
    selectCompany,
    routeKind,
    setRouteKind: (kind) => {
      if (!running) {
        setRouteKind(kind);
        setProgress(0);
      }
    },
    accuracy,
    setAccuracy: (value) => {
      if (!running) setAccuracy(value);
    },
    running,
    progress,
    routeLength: route.length,
    monitoringActive: snapshot?.running ?? false,
    start,
    stop,
    goBack: () => {
      cancelled.current = true;
      router.back();
    },
  };
}
