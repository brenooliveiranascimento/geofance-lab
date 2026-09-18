import { useQuery } from '@tanstack/react-query';

import { readSnapshot } from '@src/domains/geofencing/services/monitorService';
import type { MonitorSnapshot } from '@src/domains/geofencing/types';

export const MONITOR_SNAPSHOT_KEY = ['monitor-snapshot'] as const;

export function useMonitorSnapshot() {
  return useQuery<MonitorSnapshot>({
    queryKey: MONITOR_SNAPSHOT_KEY,
    queryFn: async () => readSnapshot(),
    refetchInterval: 5_000,
    staleTime: 1_000,
  });
}
