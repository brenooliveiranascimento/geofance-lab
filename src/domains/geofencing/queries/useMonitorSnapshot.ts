import { useQuery } from '@tanstack/react-query';

import { readSnapshot } from '../services/monitorService';
import type { MonitorSnapshot } from '../types';

export const MONITOR_SNAPSHOT_KEY = ['monitor-snapshot'] as const;

/**
 * Polls the persisted monitor state.
 *
 * Polling rather than subscribing because the writer is usually a background
 * task in a context with no bridge back to the UI — there is no event to listen
 * to. Five seconds is frequent enough to feel live and far too rare to matter
 * for battery while the screen is on.
 */
export function useMonitorSnapshot() {
  return useQuery<MonitorSnapshot>({
    queryKey: MONITOR_SNAPSHOT_KEY,
    queryFn: async () => readSnapshot(),
    refetchInterval: 5_000,
    staleTime: 1_000,
  });
}
