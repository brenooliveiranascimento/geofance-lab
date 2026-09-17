import { METERS_PER_DEGREE_LATITUDE, metersPerDegreeLongitude, type Fix } from '@src/core/geo';

import type { Place } from '../types';

export interface RouteOptions {
  steps: number;
  intervalMs: number;
  accuracy: number;
  bearingDegrees: number;
  marginMeters: number;
  lateralOffsetMeters: number;
  endAt: number;
}

export const DEFAULT_ROUTE_OPTIONS: Omit<RouteOptions, 'endAt'> = {
  steps: 121,
  intervalMs: 6_000,
  accuracy: 8,
  bearingDegrees: 0,
  marginMeters: 60,
  lateralOffsetMeters: 3,
};

export function buildCrossingRoute(place: Place, options: RouteOptions): Fix[] {
  const {
    steps,
    intervalMs,
    accuracy,
    bearingDegrees,
    marginMeters,
    lateralOffsetMeters,
    endAt,
  } = options;
  if (steps < 2) return [];

  const half = place.activeRadius + marginMeters;
  const radians = (bearingDegrees * Math.PI) / 180;
  const metersPerLongitude = metersPerDegreeLongitude(place.latitude);

  const forwardNorth = Math.cos(radians);
  const forwardEast = Math.sin(radians);
  const sideNorth = -forwardEast;
  const sideEast = forwardNorth;

  const startAt = endAt - (steps - 1) * intervalMs;

  return Array.from({ length: steps }, (_, index) => {
    const along = -half + (2 * half * index) / (steps - 1);

    const north = along * forwardNorth + lateralOffsetMeters * sideNorth;
    const east = along * forwardEast + lateralOffsetMeters * sideEast;

    return {
      latitude: place.latitude + north / METERS_PER_DEGREE_LATITUDE,
      longitude: place.longitude + east / metersPerLongitude,
      accuracy,
      timestamp: startAt + index * intervalMs,
    };
  });
}

export function buildApproachRoute(place: Place, options: RouteOptions): Fix[] {
  const full = buildCrossingRoute(place, options);
  const middle = Math.ceil(full.length / 2);
  const head = full.slice(0, middle);

  const centre = head[head.length - 1];
  const tail = Array.from({ length: full.length - middle }, (_, index) => ({
    ...centre,
    timestamp: centre.timestamp + (index + 1) * options.intervalMs,
  }));

  return [...head, ...tail];
}
