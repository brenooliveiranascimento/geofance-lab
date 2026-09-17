import { useQuery } from '@tanstack/react-query';

import { listPlaces } from '../services/placeRepository';
import type { Place } from '../types';

export const PLACES_KEY = ['places'] as const;

export function usePlaces() {
  return useQuery<Place[]>({
    queryKey: PLACES_KEY,
    queryFn: async () => listPlaces(),
    staleTime: 30_000,
  });
}
