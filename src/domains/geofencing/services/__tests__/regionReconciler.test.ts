import { METERS_PER_DEGREE_LATITUDE, distanceMeters } from '@src/core/geo';
import type { LatLng } from '@src/core/geo';

import { regionsEqual, selectRegions, type SelectRegionsOptions } from '@src/domains/geofencing/services/regionReconciler';
import type { Company } from '@src/domains/geofencing/types';

const ORIGIN: LatLng = { latitude: -23.55, longitude: -46.63 };

const IOS: SelectRegionsOptions = {
  limit: 20,
  minRegionRadiusMeters: 100,
  minGuardRadiusMeters: 200,
  maxGuardRadiusMeters: 100_000,
  guardIdentifier: '__guard__',
};

function companyAt(
  id: string,
  meters: number,
  overrides: Partial<Company> = {},
): Company {
  return {
    id,
    name: id,
    latitude: ORIGIN.latitude + meters / METERS_PER_DEGREE_LATITUDE,
    longitude: ORIGIN.longitude,
    radius: 60,
    activeRadius: 100,
    polygon: null,
    enabled: true,
    createdAt: 0,
    ...overrides,
  };
}

const manyCompanies = (count = 520): Company[] =>
  Array.from({ length: count }, (_, i) => companyAt(`p${String(i).padStart(3, '0')}`, (i + 1) * 250));

describe('respecting the platform ceiling', () => {
  it('never registers more regions than the platform allows', () => {
    const result = selectRegions(manyCompanies(), ORIGIN, IOS);
    expect(result.regions).toHaveLength(20);
    expect(result.selected).toHaveLength(19);
    expect(result.guard).not.toBeNull();
    expect(result.omittedCount).toBe(501);
  });

  it('honours the larger Android ceiling', () => {
    const result = selectRegions(manyCompanies(), ORIGIN, { ...IOS, limit: 100 });
    expect(result.regions).toHaveLength(100);
    expect(result.selected).toHaveLength(99);
  });

  it('spends every slot on real companies when they all fit', () => {
    const companies = manyCompanies(12);
    const result = selectRegions(companies, ORIGIN, IOS);
    expect(result.regions).toHaveLength(12);
    expect(result.guard).toBeNull();
    expect(result.omittedCount).toBe(0);
  });

  it('returns nothing for a zero ceiling', () => {
    const result = selectRegions(manyCompanies(30), ORIGIN, { ...IOS, limit: 0 });
    expect(result.regions).toEqual([]);
    expect(result.omittedCount).toBe(30);
  });

  it('handles an empty dataset', () => {
    const result = selectRegions([], ORIGIN, IOS);
    expect(result.regions).toEqual([]);
    expect(result.guard).toBeNull();
  });
});

describe('which companies win a slot', () => {
  it('picks the nearest ones', () => {
    const result = selectRegions(manyCompanies(), ORIGIN, IOS);
    const ids = result.selected.map((entry) => entry.company.id);
    expect(ids[0]).toBe('p000');
    expect(ids).toHaveLength(19);
    expect(ids).toEqual([...ids].sort());
  });

  it('ranks by distance to the boundary, not to the centre', () => {
    const near = companyAt('narrow', 900, { radius: 20, activeRadius: 30 });
    const wide = companyAt('wide', 1500, { radius: 1400, activeRadius: 1600 });

    const result = selectRegions([near, wide], ORIGIN, { ...IOS, limit: 2 });
    expect(result.selected.map((e) => e.company.id)).toEqual(['wide', 'narrow']);
    expect(result.selected[0].edgeDistanceMeters).toBeLessThan(0);
  });

  it('skips disabled companies', () => {
    const companies = [companyAt('a', 100), companyAt('b', 200, { enabled: false }), companyAt('c', 300)];
    const result = selectRegions(companies, ORIGIN, IOS);
    expect(result.selected.map((e) => e.company.id)).toEqual(['a', 'c']);
  });

  it('produces a stable set for equidistant companies', () => {
    const tied = ['z', 'm', 'a'].map((id) => companyAt(id, 500));
    const first = selectRegions(tied, ORIGIN, { ...IOS, limit: 3 });
    const second = selectRegions([...tied].reverse(), ORIGIN, { ...IOS, limit: 3 });
    expect(first.selected.map((e) => e.company.id)).toEqual(['a', 'm', 'z']);
    expect(regionsEqual(first.regions, second.regions)).toBe(true);
  });
});

describe('registered radii', () => {
  it('registers the outer threshold, not the entry radius', () => {
    const result = selectRegions([companyAt('big', 500, { radius: 150, activeRadius: 400 })], ORIGIN, IOS);
    expect(result.regions[0].radius).toBe(400);
  });

  it('clamps up to the platform minimum', () => {
    const tiny = companyAt('tiny', 300, { radius: 8, activeRadius: 12 });
    const result = selectRegions([tiny], ORIGIN, IOS);
    expect(result.regions[0].radius).toBe(100);
  });

  it('asks for both edges on company regions', () => {
    const result = selectRegions([companyAt('a', 300)], ORIGIN, IOS);
    expect(result.regions[0]).toMatchObject({ notifyOnEnter: true, notifyOnExit: true });
  });
});

describe('the guard region', () => {
  const result = selectRegions(manyCompanies(), ORIGIN, IOS);
  const guard = result.guard!;

  it('sits on the origin and only fires on exit', () => {
    expect(guard.identifier).toBe('__guard__');
    expect(guard.latitude).toBe(ORIGIN.latitude);
    expect(guard.longitude).toBe(ORIGIN.longitude);
    expect(guard).toMatchObject({ notifyOnEnter: false, notifyOnExit: true });
  });

  it('is small enough that the window cannot change before it fires', () => {
    const lastKept = result.selected[result.selected.length - 1].edgeDistanceMeters;
    const firstDropped =
      distanceMeters(ORIGIN, manyCompanies()[19]) - manyCompanies()[19].activeRadius;
    expect(guard.radius).toBeLessThanOrEqual(
      Math.max((firstDropped - lastKept) / 2, IOS.minGuardRadiusMeters),
    );
  });

  it('never drops below the reliable platform minimum', () => {
    const dense = Array.from({ length: 520 }, (_, i) => companyAt(`d${i}`, (i + 1) * 5));
    const tight = selectRegions(dense, ORIGIN, IOS);
    expect(tight.guard!.radius).toBeGreaterThanOrEqual(IOS.minRegionRadiusMeters);
  });

  it('grows when the next company is far away', () => {
    const sparse = [
      ...Array.from({ length: 19 }, (_, i) => companyAt(`near${i}`, 100 + i * 10)),
      companyAt('faraway1', 50_000),
      companyAt('faraway2', 60_000),
    ];
    const spread = selectRegions(sparse, ORIGIN, IOS);
    expect(spread.guard!.radius).toBeGreaterThan(10_000);
  });

  it('stays inside the radius the platform agrees to monitor', () => {
    const continents = [
      ...Array.from({ length: 19 }, (_, i) => companyAt(`near${i}`, 100 + i * 10)),
      companyAt('overseas1', 8_000_000),
      companyAt('overseas2', 9_000_000),
    ];
    const spread = selectRegions(continents, ORIGIN, IOS);
    expect(spread.guard!.radius).toBe(IOS.maxGuardRadiusMeters);
  });
});

describe('regionsEqual', () => {
  const a = selectRegions(manyCompanies(), ORIGIN, IOS).regions;

  it('recognises an identical set regardless of order', () => {
    expect(regionsEqual(a, [...a].reverse())).toBe(true);
  });

  it('detects a moved origin', () => {
    const moved = selectRegions(manyCompanies(), { latitude: -23.4, longitude: -46.63 }, IOS).regions;
    expect(regionsEqual(a, moved)).toBe(false);
  });

  it('detects a different size', () => {
    expect(regionsEqual(a, a.slice(1))).toBe(false);
  });
});
