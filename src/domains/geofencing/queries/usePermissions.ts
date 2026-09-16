import { useQuery } from '@tanstack/react-query';

import { readPermissions, type MonitoringPermissions } from '@src/core/permissions';

export const PERMISSIONS_KEY = ['permissions'] as const;

export function usePermissions() {
  return useQuery<MonitoringPermissions>({
    queryKey: PERMISSIONS_KEY,
    queryFn: readPermissions,
    // The user can revoke access in Settings while the app is backgrounded, so
    // this is never cached for long.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
