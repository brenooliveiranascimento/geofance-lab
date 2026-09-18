import { METERS_PER_DEGREE_LATITUDE, distanceMeters } from '@src/core/geo';
import type { LatLng } from '@src/core/geo';

import { selectRegions, type SelectRegionsOptions } from '@src/domains/geofencing/services/regionReconciler';
import type { Company } from '@src/domains/geofencing/types';

const ORIGIN: LatLng = { latitude: -23.55, longitude: -46.63 };

const IOS: SelectRegionsOptions = {
  limit: 20,
  minRegionRadiusMeters: 100,
  minGuardRadiusMeters: 200,
  maxGuardRadiusMeters: 100_000,
  guardIdentifier: '__guard__',
};

const companyAt = (id: string, meters: number, overrides: Partial<Company> = {}): Company => ({
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
});

const manyCompanies = (count = 520): Company[] =>
  Array.from({ length: count }, (_, i) => companyAt(`p${String(i).padStart(3, '0')}`, (i + 1) * 250));

it('never registers more regions than the platform allows', () => {
  const result = selectRegions(manyCompanies(), ORIGIN, IOS);
  expect(result.regions).toHaveLength(20);
  expect(result.selected).toHaveLength(19);
  expect(result.guard).not.toBeNull();
  expect(result.omittedCount).toBe(501);
});

it('ranks by distance to the boundary, not to the centre', () => {
  const near = companyAt('narrow', 900, { radius: 20, activeRadius: 30 });
  const wide = companyAt('wide', 1500, { radius: 1400, activeRadius: 1600 });

  const result = selectRegions([near, wide], ORIGIN, { ...IOS, limit: 2 });
  expect(result.selected.map((e) => e.company.id)).toEqual(['wide', 'narrow']);
});

it('sizes the guard so the window cannot change before it fires', () => {
  const result = selectRegions(manyCompanies(), ORIGIN, IOS);
  const lastKept = result.selected[result.selected.length - 1].edgeDistanceMeters;
  const firstDropped =
    distanceMeters(ORIGIN, manyCompanies()[19]) - manyCompanies()[19].activeRadius;

  expect(result.guard).toMatchObject({ notifyOnEnter: false, notifyOnExit: true });
  expect(result.guard!.radius).toBeLessThanOrEqual(
    Math.max((firstDropped - lastKept) / 2, IOS.minGuardRadiusMeters),
  );
});
