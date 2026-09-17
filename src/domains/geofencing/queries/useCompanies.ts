import { useQuery } from '@tanstack/react-query';

import { listCompanies } from '../services/companyRepository';
import type { Company } from '../types';

export const COMPANIES_KEY = ['companies'] as const;

export function useCompanies() {
  return useQuery<Company[]>({
    queryKey: COMPANIES_KEY,
    queryFn: async () => listCompanies(),
    staleTime: 30_000,
  });
}
