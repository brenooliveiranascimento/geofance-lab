import { distanceMeters } from '@src/core/geo';
import type { LatLng } from '@src/core/geo';

import type { NativeRegion, Company } from '@src/domains/geofencing/types';

export interface SelectRegionsOptions {
  limit: number;
  minRegionRadiusMeters: number;
  minGuardRadiusMeters: number;
  maxGuardRadiusMeters: number;
  guardIdentifier: string;
}

export interface SelectedCompany {
  company: Company;
  distanceMeters: number;
  edgeDistanceMeters: number;
}

export interface SelectRegionsResult {
  regions: NativeRegion[];
  selected: SelectedCompany[];
  guard: NativeRegion | null;
  omittedCount: number;
}

function toRegion(company: Company, minRadius: number): NativeRegion {
  return {
    identifier: company.id,
    latitude: company.latitude,
    longitude: company.longitude,
    radius: Math.max(company.activeRadius, minRadius),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

function guardRadiusFor(
  lastSelectedEdge: number,
  firstOmittedEdge: number,
  minGuardRadiusMeters: number,
  maxGuardRadiusMeters: number,
): number {
  const halfGap = (firstOmittedEdge - lastSelectedEdge) / 2;
  return Math.min(Math.max(halfGap, minGuardRadiusMeters), maxGuardRadiusMeters);
}

export function selectRegions(
  companies: readonly Company[],
  origin: LatLng,
  options: SelectRegionsOptions,
): SelectRegionsResult {
  const { limit, minRegionRadiusMeters, minGuardRadiusMeters, maxGuardRadiusMeters, guardIdentifier } =
    options;

  const ranked: SelectedCompany[] = companies
    .filter((company) => company.enabled)
    .map((company) => {
      const distance = distanceMeters(origin, company);
      return {
        company,
        distanceMeters: distance,
        edgeDistanceMeters: distance - company.activeRadius,
      };
    })
    .sort(
      (a, b) =>
        a.edgeDistanceMeters - b.edgeDistanceMeters || a.company.id.localeCompare(b.company.id),
    );

  if (limit <= 0) {
    return { regions: [], selected: [], guard: null, omittedCount: ranked.length };
  }

  if (ranked.length <= limit) {
    return {
      regions: ranked.map((entry) => toRegion(entry.company, minRegionRadiusMeters)),
      selected: ranked,
      guard: null,
      omittedCount: 0,
    };
  }

  const selected = ranked.slice(0, limit - 1);
  const firstOmitted = ranked[limit - 1];
  const lastSelected = selected[selected.length - 1];

  const guard: NativeRegion = {
    identifier: guardIdentifier,
    latitude: origin.latitude,
    longitude: origin.longitude,
    radius: Math.max(
      guardRadiusFor(
        lastSelected.edgeDistanceMeters,
        firstOmitted.edgeDistanceMeters,
        minGuardRadiusMeters,
        maxGuardRadiusMeters,
      ),
      minRegionRadiusMeters,
    ),
    notifyOnEnter: false,
    notifyOnExit: true,
  };

  return {
    regions: [...selected.map((entry) => toRegion(entry.company, minRegionRadiusMeters)), guard],
    selected,
    guard,
    omittedCount: ranked.length - selected.length,
  };
}

export function regionsEqual(a: readonly NativeRegion[], b: readonly NativeRegion[]): boolean {
  if (a.length !== b.length) return false;

  const key = (region: NativeRegion) =>
    `${region.identifier}|${region.latitude.toFixed(6)}|${region.longitude.toFixed(6)}|${region.radius.toFixed(1)}|${region.notifyOnEnter}|${region.notifyOnExit}`;

  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}
