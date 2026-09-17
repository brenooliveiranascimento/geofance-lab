import { METERS_PER_DEGREE_LATITUDE, distanceMeters } from '@src/core/geo';
import type { LatLng } from '@src/core/geo';

import { regionsEqual, selectRegions, type SelectRegionsOptions } from '../regionReconciler';
import type { Place } from '../../types';

const ORIGIN: LatLng = { latitude: -23.55, longitude: -46.63 };

const IOS: SelectRegionsOptions = {
  limit: 20,
  minRegionRadiusMeters: 100,
  minGuardRadiusMeters: 200,
  guardIdentifier: '__guard__',
};

function placeAt(
  id: string,
  meters: number,
  overrides: Partial<Place> = {},
): Place {
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

const manyPlaces = (count = 520): Place[] =>
  Array.from({ length: count }, (_, i) => placeAt(`p${String(i).padStart(3, '0')}`, (i + 1) * 250));

describe('respecting the platform ceiling', () => {
  it('never registers more regions than the platform allows', () => {
    const result = selectRegions(manyPlaces(), ORIGIN, IOS);
    expect(result.regions).toHaveLength(20);
    expect(result.selected).toHaveLength(19);
    expect(result.guard).not.toBeNull();
    expect(result.omittedCount).toBe(501);
  });

  it('honours the larger Android ceiling', () => {
    const result = selectRegions(manyPlaces(), ORIGIN, { ...IOS, limit: 100 });
    expect(result.regions).toHaveLength(100);
    expect(result.selected).toHaveLength(99);
  });

  it('spends every slot on real places when they all fit', () => {
    const places = manyPlaces(12);
    const result = selectRegions(places, ORIGIN, IOS);
    expect(result.regions).toHaveLength(12);
    expect(result.guard).toBeNull();
    expect(result.omittedCount).toBe(0);
  });

  it('returns nothing for a zero ceiling', () => {
    const result = selectRegions(manyPlaces(30), ORIGIN, { ...IOS, limit: 0 });
    expect(result.regions).toEqual([]);
    expect(result.omittedCount).toBe(30);
  });

  it('handles an empty dataset', () => {
    const result = selectRegions([], ORIGIN, IOS);
    expect(result.regions).toEqual([]);
    expect(result.guard).toBeNull();
  });
});

describe('which places win a slot', () => {
  it('picks the nearest ones', () => {
    const result = selectRegions(manyPlaces(), ORIGIN, IOS);
    const ids = result.selected.map((entry) => entry.place.id);
    expect(ids[0]).toBe('p000');
    expect(ids).toHaveLength(19);
    expect(ids).toEqual([...ids].sort());
  });

  it('ranks by distance to the boundary, not to the centre', () => {
    const near = placeAt('narrow', 900, { radius: 20, activeRadius: 30 });
    const wide = placeAt('wide', 1500, { radius: 1400, activeRadius: 1600 });

    const result = selectRegions([near, wide], ORIGIN, { ...IOS, limit: 2 });
    expect(result.selected.map((e) => e.place.id)).toEqual(['wide', 'narrow']);
    expect(result.selected[0].edgeDistanceMeters).toBeLessThan(0);
  });

  it('skips disabled places', () => {
    const places = [placeAt('a', 100), placeAt('b', 200, { enabled: false }), placeAt('c', 300)];
    const result = selectRegions(places, ORIGIN, IOS);
    expect(result.selected.map((e) => e.place.id)).toEqual(['a', 'c']);
  });

  it('produces a stable set for equidistant places', () => {
    const tied = ['z', 'm', 'a'].map((id) => placeAt(id, 500));
    const first = selectRegions(tied, ORIGIN, { ...IOS, limit: 3 });
    const second = selectRegions([...tied].reverse(), ORIGIN, { ...IOS, limit: 3 });
    expect(first.selected.map((e) => e.place.id)).toEqual(['a', 'm', 'z']);
    expect(regionsEqual(first.regions, second.regions)).toBe(true);
  });
});

describe('registered radii', () => {
  it('registers the outer threshold, not the entry radius', () => {
    const result = selectRegions([placeAt('big', 500, { radius: 150, activeRadius: 400 })], ORIGIN, IOS);
    expect(result.regions[0].radius).toBe(400);
  });

  it('clamps up to the platform minimum', () => {
    const tiny = placeAt('tiny', 300, { radius: 8, activeRadius: 12 });
    const result = selectRegions([tiny], ORIGIN, IOS);
    expect(result.regions[0].radius).toBe(100);
  });

  it('asks for both edges on place regions', () => {
    const result = selectRegions([placeAt('a', 300)], ORIGIN, IOS);
    expect(result.regions[0]).toMatchObject({ notifyOnEnter: true, notifyOnExit: true });
  });
});

describe('the guard region', () => {
  const result = selectRegions(manyPlaces(), ORIGIN, IOS);
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
      distanceMeters(ORIGIN, manyPlaces()[19]) - manyPlaces()[19].activeRadius;
    expect(guard.radius).toBeLessThanOrEqual(
      Math.max((firstDropped - lastKept) / 2, IOS.minGuardRadiusMeters),
    );
  });

  it('never drops below the reliable platform minimum', () => {
    const dense = Array.from({ length: 520 }, (_, i) => placeAt(`d${i}`, (i + 1) * 5));
    const tight = selectRegions(dense, ORIGIN, IOS);
    expect(tight.guard!.radius).toBeGreaterThanOrEqual(IOS.minRegionRadiusMeters);
  });

  it('grows when the next place is far away', () => {
    const sparse = [
      ...Array.from({ length: 19 }, (_, i) => placeAt(`near${i}`, 100 + i * 10)),
      placeAt('faraway1', 50_000),
      placeAt('faraway2', 60_000),
    ];
    const spread = selectRegions(sparse, ORIGIN, IOS);
    expect(spread.guard!.radius).toBeGreaterThan(10_000);
  });
});

describe('regionsEqual', () => {
  const a = selectRegions(manyPlaces(), ORIGIN, IOS).regions;

  it('recognises an identical set regardless of order', () => {
    expect(regionsEqual(a, [...a].reverse())).toBe(true);
  });

  it('detects a moved origin', () => {
    const moved = selectRegions(manyPlaces(), { latitude: -23.4, longitude: -46.63 }, IOS).regions;
    expect(regionsEqual(a, moved)).toBe(false);
  });

  it('detects a different size', () => {
    expect(regionsEqual(a, a.slice(1))).toBe(false);
  });
});
