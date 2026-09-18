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

  it('spends every slot on real companies when they all fit', () => {
    const companies = manyCompanies(12);
    const result = selectRegions(companies, ORIGIN, IOS);
    expect(result.regions).toHaveLength(12);
    expect(result.guard).toBeNull();
    expect(result.omittedCount).toBe(0);
  });

});

describe('which companies win a slot', () => {

  it('ranks by distance to the boundary, not to the centre', () => {
    const near = companyAt('narrow', 900, { radius: 20, activeRadius: 30 });
    const wide = companyAt('wide', 1500, { radius: 1400, activeRadius: 1600 });

    const result = selectRegions([near, wide], ORIGIN, { ...IOS, limit: 2 });
    expect(result.selected.map((e) => e.company.id)).toEqual(['wide', 'narrow']);
    expect(result.selected[0].edgeDistanceMeters).toBeLessThan(0);
  });

});

describe('registered radii', () => {
  it('registers the outer threshold, not the entry radius', () => {
    const result = selectRegions([companyAt('big', 500, { radius: 150, activeRadius: 400 })], ORIGIN, IOS);
    expect(result.regions[0].radius).toBe(400);
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

});
