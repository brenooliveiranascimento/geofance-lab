import { queryClient } from '@src/lib/query/client';

import { EVENTS_KEY } from './useEvents';
import { MONITOR_SNAPSHOT_KEY } from './useMonitorSnapshot';
import { PERMISSIONS_KEY } from './usePermissions';
import { PLACE_STATES_KEY } from './usePlaceStates';
import { PLACES_KEY } from './usePlaces';

/**
 * Anything that mutates the database goes through here.
 *
 * A single entry point instead of scattered `invalidateQueries` calls: the
 * screens share one dataset, and a partial invalidation shows a stale map next
 * to a fresh list.
 */
export function invalidateGeofencingData(): void {
  void queryClient.invalidateQueries({ queryKey: PLACES_KEY });
  void queryClient.invalidateQueries({ queryKey: PLACE_STATES_KEY });
  void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
  void queryClient.invalidateQueries({ queryKey: MONITOR_SNAPSHOT_KEY });
}

export function invalidatePermissions(): void {
  void queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY });
}
