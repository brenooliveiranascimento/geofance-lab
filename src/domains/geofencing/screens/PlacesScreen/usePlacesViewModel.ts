import { useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { reseed } from '@src/core/bootstrap';
import { distanceMeters, type LatLng } from '@src/core/geo';
import { useToast } from '@src/lib/toast';

import { invalidateGeofencingData } from '../../queries/invalidate';
import { useMonitorSnapshot } from '../../queries/useMonitorSnapshot';
import { usePlaceStates } from '../../queries/usePlaceStates';
import { usePlaces } from '../../queries/usePlaces';
import { refreshMonitoring } from '../../services/monitorService';
import { setPlaceEnabled } from '../../services/placeRepository';
import type { Place, TargetState } from '../../types';

export type PlaceFilter = 'all' | 'inside' | 'residences' | 'disabled';

export interface PlaceRow {
  place: Place;
  state: TargetState | undefined;
  distanceMeters: number | null;
}

export interface PlacesViewModel {
  rows: PlaceRow[];
  total: number;
  search: string;
  setSearch: (value: string) => void;
  filter: PlaceFilter;
  setFilter: (value: PlaceFilter) => void;
  origin: LatLng | null;
  busy: boolean;
  openPlace: (id: string) => void;
  createPlace: () => void;
  toggleEnabled: (place: Place) => void;
  reseedDataset: () => Promise<void>;
}

export function usePlacesViewModel(): PlacesViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PlaceFilter>('all');
  const [busy, setBusy] = useState(false);

  const { data: places = [] } = usePlaces();
  const { data: states = new Map<string, TargetState>() } = usePlaceStates();
  const { data: snapshot } = useMonitorSnapshot();

  const origin = snapshot?.lastFix ?? snapshot?.origin ?? null;

  // Typing filters 520 rows on every keystroke; deferring keeps the input
  // responsive by letting React drop intermediate results.
  const deferredSearch = useDeferredValue(search);

  const rows = useMemo<PlaceRow[]>(() => {
    const needle = deferredSearch.trim().toLowerCase();

    const filtered = places.filter((place) => {
      if (needle && !place.name.toLowerCase().includes(needle)) return false;

      switch (filter) {
        case 'inside':
          return states.get(place.id)?.state === 'inside';
        case 'residences':
          return place.polygon !== null;
        case 'disabled':
          return !place.enabled;
        default:
          return true;
      }
    });

    const mapped = filtered.map((place) => ({
      place,
      state: states.get(place.id),
      distanceMeters: origin ? distanceMeters(origin, place) : null,
    }));

    // Nearest first when we know where we are; alphabetical otherwise.
    return origin
      ? mapped.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
      : mapped;
  }, [places, states, deferredSearch, filter, origin]);

  const toggleEnabled = useCallback(
    (place: Place) => {
      setPlaceEnabled(place.id, !place.enabled);
      invalidateGeofencingData();
      void refreshMonitoring();
    },
    [],
  );

  const reseedDataset = useCallback(async () => {
    setBusy(true);
    try {
      const count = reseed();
      invalidateGeofencingData();
      await refreshMonitoring();
      toast.show({ message: t('places.reseeded', { total: count }) });
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  return {
    rows,
    total: places.length,
    search,
    setSearch,
    filter,
    setFilter,
    origin,
    busy,
    openPlace: (id) => router.push(`/places/${id}`),
    createPlace: () => router.push('/places/new'),
    toggleEnabled,
    reseedDataset,
  };
}
