import { distanceMeters } from '@src/core/geo';

import {
  DEFAULT_ROUTE_OPTIONS,
  buildApproachRoute,
  buildCrossingRoute,
  type RouteOptions,
} from '../routeSimulator';
import type { Company } from '../../types';

const COMPANY: Company = {
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
  const route = buildCrossingRoute(COMPANY, OPTIONS);

  it('produces the requested number of fixes', () => {
    expect(route).toHaveLength(OPTIONS.steps);
  });

  it('starts and ends clear of the activeRadius', () => {
    expect(distanceMeters(route[0], COMPANY)).toBeGreaterThan(COMPANY.activeRadius);
    expect(distanceMeters(route[route.length - 1], COMPANY)).toBeGreaterThan(COMPANY.activeRadius);
  });

  it('passes through the centre when not offset', () => {
    const centred = buildCrossingRoute(COMPANY, { ...OPTIONS, lateralOffsetMeters: 0 });
    const closest = Math.min(...centred.map((fix) => distanceMeters(fix, COMPANY)));
    expect(closest).toBeLessThan(1);
  });

  it('shifts sideways by the requested offset', () => {
    const closest = Math.min(...route.map((fix) => distanceMeters(fix, COMPANY)));
    expect(closest).toBeCloseTo(OPTIONS.lateralOffsetMeters, 0);
  });

  it('applies the offset perpendicular to the bearing', () => {
    expect(route.every((fix) => fix.longitude > COMPANY.longitude)).toBe(true);
  });

  it('crosses the entry radius on the way in and on the way out', () => {
    const inside = route.filter((fix) => distanceMeters(fix, COMPANY) <= COMPANY.radius);
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
    const east = buildCrossingRoute(COMPANY, {
      ...OPTIONS,
      bearingDegrees: 90,
      lateralOffsetMeters: 0,
    });
    expect(Math.abs(east[0].latitude - COMPANY.latitude)).toBeLessThan(1e-9);
    expect(east[0].longitude).toBeLessThan(COMPANY.longitude);
  });

  it('returns nothing for a degenerate step count', () => {
    expect(buildCrossingRoute(COMPANY, { ...OPTIONS, steps: 1 })).toEqual([]);
  });
});

describe('buildApproachRoute', () => {
  const route = buildApproachRoute(COMPANY, OPTIONS);

  it('starts outside and stays inside', () => {
    expect(distanceMeters(route[0], COMPANY)).toBeGreaterThan(COMPANY.activeRadius);
    expect(distanceMeters(route[route.length - 1], COMPANY)).toBeLessThan(COMPANY.radius);
  });

  it('keeps the timeline monotonic across the hold', () => {
    const stamps = route.map((fix) => fix.timestamp);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
