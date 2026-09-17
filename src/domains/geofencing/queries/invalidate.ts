import { queryClient } from '@src/lib/query/client';

import { EVENTS_KEY } from './useEvents';
import { MONITOR_SNAPSHOT_KEY } from './useMonitorSnapshot';
import { PERMISSIONS_KEY } from './usePermissions';
import { COMPANY_STATES_KEY } from './useCompanyStates';
import { COMPANIES_KEY } from './useCompanies';

export function invalidateGeofencingData(): void {
  void queryClient.invalidateQueries({ queryKey: COMPANIES_KEY });
  void queryClient.invalidateQueries({ queryKey: COMPANY_STATES_KEY });
  void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
  void queryClient.invalidateQueries({ queryKey: MONITOR_SNAPSHOT_KEY });
}

export function invalidatePermissions(): void {
  void queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY });
}
