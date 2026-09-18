import { useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';

import { distanceMeters, type LatLng } from '@src/core/geo';

import { invalidateGeofencingData } from '@src/domains/geofencing/queries/invalidate';
import { useCompanies } from '@src/domains/geofencing/queries/useCompanies';
import { useCompanyStates } from '@src/domains/geofencing/queries/useCompanyStates';
import { useMonitorSnapshot } from '@src/domains/geofencing/queries/useMonitorSnapshot';
import { refreshMonitoring } from '@src/domains/geofencing/services/monitorService';
import { countRoomsByCompany, setCompanyEnabled } from '@src/domains/geofencing/services/companyRepository';
import type { Company, TargetState } from '@src/domains/geofencing/types';

export interface CompanyRow {
  company: Company;
  state: TargetState | undefined;
  roomCount: number;
  distanceMeters: number | null;
}

export interface CompaniesViewModel {
  rows: CompanyRow[];
  total: number;
  search: string;
  setSearch: (value: string) => void;
  origin: LatLng | null;
  openCompany: (id: string) => void;
  createCompany: () => void;
  toggleEnabled: (company: Company) => void;
}

export function useCompaniesViewModel(): CompaniesViewModel {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: companies = [] } = useCompanies();
  const { data: states = new Map<string, TargetState>() } = useCompanyStates();
  const { data: snapshot } = useMonitorSnapshot();

  const origin = snapshot?.lastFix ?? snapshot?.origin ?? null;
  const deferredSearch = useDeferredValue(search);

  const rows = useMemo<CompanyRow[]>(() => {
    const needle = deferredSearch.trim().toLowerCase();
    const roomCounts = countRoomsByCompany();

    const mapped = companies
      .filter((company) => !needle || company.name.toLowerCase().includes(needle))
      .map((company) => ({
        company,
        state: company.enabled ? states.get(company.id) : undefined,
        roomCount: roomCounts.get(company.id) ?? 0,
        distanceMeters: origin ? distanceMeters(origin, company) : null,
      }));

    return origin
      ? mapped.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
      : mapped;
  }, [companies, states, deferredSearch, origin]);

  const toggleEnabled = useCallback((company: Company) => {
    setCompanyEnabled(company.id, !company.enabled);
    invalidateGeofencingData();
    void refreshMonitoring();
  }, []);

  return {
    rows,
    total: companies.length,
    search,
    setSearch,
    origin,
    openCompany: (id) => router.push(`/companies/${id}`),
    createCompany: () => router.push('/companies/new'),
    toggleEnabled,
  };
}
