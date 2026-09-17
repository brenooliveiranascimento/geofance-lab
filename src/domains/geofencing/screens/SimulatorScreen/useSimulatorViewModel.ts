import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Fix } from '@src/core/geo';
import { useToast } from '@src/lib/toast';

import { invalidateGeofencingData } from '../../queries/invalidate';
import { useMonitorSnapshot } from '../../queries/useMonitorSnapshot';
import { usePlaces } from '../../queries/usePlaces';
import { submitSimulatedFix } from '../../services/monitorService';
import {
  DEFAULT_ROUTE_OPTIONS,
  buildApproachRoute,
  buildCrossingRoute,
} from '../../services/routeSimulator';
import type { Place } from '../../types';

export type RouteKind = 'crossing' | 'approach';

const PLAYBACK_INTERVAL_MS = 120;

export interface SimulatorViewModel {
  places: Place[];
  selected: Place | null;
  selectPlace: (place: Place) => void;
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

  const { data: allPlaces = [] } = usePlaces();
  const { data: snapshot } = useMonitorSnapshot();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeKind, setRouteKind] = useState<RouteKind>('crossing');
  const [accuracy, setAccuracy] = useState(DEFAULT_ROUTE_OPTIONS.accuracy);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const cancelled = useRef(false);

  const places = useMemo(() => {
    const residences = allPlaces.filter((place) => place.polygon !== null);
    const others = allPlaces.filter((place) => place.polygon === null).slice(0, 30);
    return [...residences, ...others];
  }, [allPlaces]);

  const selected = useMemo(
    () => places.find((place) => place.id === selectedId) ?? places[0] ?? null,
    [places, selectedId],
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

  const selectPlace = useCallback(
    (place: Place) => {
      if (running) return;
      setSelectedId(place.id);
      setProgress(0);
    },
    [running],
  );

  return {
    places,
    selected,
    selectPlace,
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
