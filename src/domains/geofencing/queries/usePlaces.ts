import { useQuery } from '@tanstack/react-query';

import { listPlaces } from '../services/placeRepository';
import type { Place } from '../types';

export const PLACES_KEY = ['places'] as const;

/**
 * SQLite is synchronous, so React Query is not here for async — it is here for
 * the cache invalidation. Editing a place in one screen has to refresh the map,
 * the list and the monitor, and a shared query key does that without any of
 * them knowing about each other.
 */
export function usePlaces() {
  return useQuery<Place[]>({
    queryKey: PLACES_KEY,
    queryFn: async () => listPlaces(),
    staleTime: 30_000,
  });
}
