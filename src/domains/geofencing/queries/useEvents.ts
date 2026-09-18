import { useQuery } from '@tanstack/react-query';

import { listEvents, type EventFilter } from '@src/domains/geofencing/services/eventRepository';
import type { GeofenceEvent } from '@src/domains/geofencing/types';

export const EVENTS_KEY = ['events'] as const;

export function useEvents(filter: EventFilter = {}) {
  return useQuery<GeofenceEvent[]>({
    queryKey: [...EVENTS_KEY, filter],
    queryFn: async () => listEvents({ limit: 300, ...filter }),
    refetchInterval: 5_000,
    staleTime: 1_000,
  });
}
