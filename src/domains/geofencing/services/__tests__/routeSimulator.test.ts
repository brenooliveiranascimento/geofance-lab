import { distanceMeters } from '@src/core/geo';

import {
  DEFAULT_ROUTE_OPTIONS,
  buildApproachRoute,
  buildCrossingRoute,
  type RouteOptions,
} from '../routeSimulator';
import type { Place } from '../../types';

const PLACE: Place = {
  id: 'home',
  name: 'Casa',
  latitude: -23.5615,
  longitude: -46.7021,
  radius: 45,
  activeRadius: 80,
  polygon: null,
  enabled: true,
  createdAt: 0,
};

const END_AT = new Date(2026, 8, 16, 12, 0, 0).getTime();
const OPTIONS: RouteOptions = { ...DEFAULT_ROUTE_OPTIONS, endAt: END_AT };

describe('buildCrossingRoute', () => {
  const route = buildCrossingRoute(PLACE, OPTIONS);

  it('produces the requested number of fixes', () => {
    expect(route).toHaveLength(OPTIONS.steps);
  });

  it('starts and ends clear of the activeRadius', () => {
    expect(distanceMeters(route[0], PLACE)).toBeGreaterThan(PLACE.activeRadius);
    expect(distanceMeters(route[route.length - 1], PLACE)).toBeGreaterThan(PLACE.activeRadius);
  });

  it('passes through the centre when not offset', () => {
    const centred = buildCrossingRoute(PLACE, { ...OPTIONS, lateralOffsetMeters: 0 });
    const closest = Math.min(...centred.map((fix) => distanceMeters(fix, PLACE)));
    expect(closest).toBeLessThan(1);
  });

  it('shifts sideways by the requested offset', () => {
    const closest = Math.min(...route.map((fix) => distanceMeters(fix, PLACE)));
    expect(closest).toBeCloseTo(OPTIONS.lateralOffsetMeters, 0);
  });

  it('applies the offset perpendicular to the bearing', () => {
    // Heading north with a positive offset moves the whole path east.
    expect(route.every((fix) => fix.longitude > PLACE.longitude)).toBe(true);
  });

  it('crosses the entry radius on the way in and on the way out', () => {
    const inside = route.filter((fix) => distanceMeters(fix, PLACE) <= PLACE.radius);
    expect(inside.length).toBeGreaterThan(2);
  });

  it('is dated into the past so real monitoring can resume cleanly', () => {
    expect(route[route.length - 1].timestamp).toBe(END_AT);
    expect(route[0].timestamp).toBeLessThan(END_AT);
  });

  it('advances the clock monotonically', () => {
    const stamps = route.map((fix) => fix.timestamp);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  });

  it('spaces fixes far enough apart to clear the dwell guard', () => {
    expect(route[1].timestamp - route[0].timestamp).toBe(OPTIONS.intervalMs);
    expect(OPTIONS.intervalMs).toBeGreaterThanOrEqual(6_000);
  });

  it('honours the bearing', () => {
    const east = buildCrossingRoute(PLACE, {
      ...OPTIONS,
      bearingDegrees: 90,
      lateralOffsetMeters: 0,
    });
    expect(Math.abs(east[0].latitude - PLACE.latitude)).toBeLessThan(1e-9);
    expect(east[0].longitude).toBeLessThan(PLACE.longitude);
  });

  it('returns nothing for a degenerate step count', () => {
    expect(buildCrossingRoute(PLACE, { ...OPTIONS, steps: 1 })).toEqual([]);
  });
});

describe('buildApproachRoute', () => {
  const route = buildApproachRoute(PLACE, OPTIONS);

  it('starts outside and stays inside', () => {
    expect(distanceMeters(route[0], PLACE)).toBeGreaterThan(PLACE.activeRadius);
    expect(distanceMeters(route[route.length - 1], PLACE)).toBeLessThan(PLACE.radius);
  });

  it('keeps the timeline monotonic across the hold', () => {
    const stamps = route.map((fix) => fix.timestamp);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
