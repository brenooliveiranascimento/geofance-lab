import { queryClient } from '@src/lib/query/client';

import { EVENTS_KEY } from '@src/domains/geofencing/queries/useEvents';
import { MONITOR_SNAPSHOT_KEY } from '@src/domains/geofencing/queries/useMonitorSnapshot';
import { PERMISSIONS_KEY } from '@src/domains/geofencing/queries/usePermissions';
import { COMPANY_STATES_KEY } from '@src/domains/geofencing/queries/useCompanyStates';
import { COMPANIES_KEY } from '@src/domains/geofencing/queries/useCompanies';

export function invalidateGeofencingData(): void {
  void queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
  void queryClient.invalidateQueries({ queryKey: COMPANY_STATES_KEY });
  void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
  void queryClient.invalidateQueries({ queryKey: MONITOR_SNAPSHOT_KEY });
}

export function invalidatePermissions(): void {
  void queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY });
}
