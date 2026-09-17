import { useQuery } from '@tanstack/react-query';

import { listStatesForUi } from '../services/stateRepository';
import type { TargetState } from '../types';

export const COMPANY_STATES_KEY = ['company-states'] as const;

export function useCompanyStates() {
  return useQuery<Map<string, TargetState>>({
    queryKey: COMPANY_STATES_KEY,
    queryFn: async () => new Map(listStatesForUi().map((state) => [state.targetId, state])),
    staleTime: 2_000,
    refetchInterval: 5_000,
  });
}
