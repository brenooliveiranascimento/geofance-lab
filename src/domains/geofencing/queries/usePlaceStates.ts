import { useQuery } from '@tanstack/react-query';

import { listStatesForUi } from '../services/stateRepository';
import type { TargetState } from '../types';

export const PLACE_STATES_KEY = ['place-states'] as const;

export function usePlaceStates() {
  return useQuery<Map<string, TargetState>>({
    queryKey: PLACE_STATES_KEY,
    queryFn: async () => new Map(listStatesForUi().map((state) => [state.targetId, state])),
    staleTime: 2_000,
    refetchInterval: 5_000,
  });
}
