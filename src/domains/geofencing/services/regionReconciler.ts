import { distanceMeters } from '@src/core/geo';
import type { LatLng } from '@src/core/geo';

import type { NativeRegion, Place } from '../types';

export interface SelectRegionsOptions {
  limit: number;
  minRegionRadiusMeters: number;
  minGuardRadiusMeters: number;
  guardIdentifier: string;
}

export interface SelectedPlace {
  place: Place;
  distanceMeters: number;
  edgeDistanceMeters: number;
}

export interface SelectRegionsResult {
  regions: NativeRegion[];
  selected: SelectedPlace[];
  guard: NativeRegion | null;
  omittedCount: number;
}

function toRegion(place: Place, minRadius: number): NativeRegion {
  return {
    identifier: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    radius: Math.max(place.activeRadius, minRadius),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

function guardRadiusFor(
  lastSelectedEdge: number,
  firstOmittedEdge: number,
  minGuardRadiusMeters: number,
): number {
  const halfGap = (firstOmittedEdge - lastSelectedEdge) / 2;
  return Math.max(halfGap, minGuardRadiusMeters);
}

export function selectRegions(
  places: readonly Place[],
  origin: LatLng,
  options: SelectRegionsOptions,
): SelectRegionsResult {
  const { limit, minRegionRadiusMeters, minGuardRadiusMeters, guardIdentifier } = options;

  const ranked: SelectedPlace[] = places
    .filter((place) => place.enabled)
    .map((place) => {
      const distance = distanceMeters(origin, place);
      return {
        place,
        distanceMeters: distance,
        edgeDistanceMeters: distance - place.activeRadius,
      };
    })
    .sort(
      (a, b) =>
        a.edgeDistanceMeters - b.edgeDistanceMeters || a.place.id.localeCompare(b.place.id),
    );

  if (limit <= 0) {
    return { regions: [], selected: [], guard: null, omittedCount: ranked.length };
  }

  if (ranked.length <= limit) {
    return {
      regions: ranked.map((entry) => toRegion(entry.place, minRegionRadiusMeters)),
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
      ),
      minRegionRadiusMeters,
    ),
    notifyOnEnter: false,
    notifyOnExit: true,
  };

  return {
    regions: [...selected.map((entry) => toRegion(entry.place, minRegionRadiusMeters)), guard],
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
