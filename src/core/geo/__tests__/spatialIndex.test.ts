import { distanceMeters } from '@src/core/geo/haversine';
import {
  DEFAULT_CELL_SIZE_DEGREES,
  buildGridIndex,
  queryNearest,
  queryWithinRadius,
} from '@src/core/geo/spatialIndex';
import type { LatLng } from '@src/core/geo/types';

interface Point extends LatLng {
  id: string;
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePoints(count: number, seed = 42): Point[] {
  const random = makeRandom(seed);
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    latitude: -23.8 + random() * 1.2,
    longitude: -46.9 + random() * 3.9,
  }));
}

const bruteForceNearest = (points: Point[], center: LatLng, k: number) =>
  points
    .map((item) => ({ item, distanceMeters: distanceMeters(center, item) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, k);

const getPoint = (p: Point): LatLng => p;

describe('queryNearest', () => {
  const points = makePoints(520);
  const index = buildGridIndex(points, getPoint);

  it('indexes every item', () => {
    expect(index.size).toBe(520);
    const bucketed = [...index.cells.values()].reduce((sum, b) => sum + b.length, 0);
    expect(bucketed).toBe(520);
  });

  it('matches brute force from many origins', () => {
    const random = makeRandom(7);
    for (let trial = 0; trial < 40; trial += 1) {
      const center = {
        latitude: -23.8 + random() * 1.2,
        longitude: -46.9 + random() * 3.9,
      };
      const expected = bruteForceNearest(points, center, 19);
      const actual = queryNearest(index, center, 19);

      expect(actual.map((r) => r.item.id)).toEqual(expected.map((r) => r.item.id));
      actual.forEach((result, i) => {
        expect(result.distanceMeters).toBeCloseTo(expected[i].distanceMeters, 6);
      });
    }
  });

  it('matches brute force from an origin far outside the cluster', () => {
    const center = { latitude: 10, longitude: 10 };
    const expected = bruteForceNearest(points, center, 5);
    const actual = queryNearest(index, center, 5);
    expect(actual.map((r) => r.item.id)).toEqual(expected.map((r) => r.item.id));
  });

  it('returns results ordered by distance', () => {
    const results = queryNearest(index, { latitude: -23.55, longitude: -46.63 }, 20);
    const distances = results.map((r) => r.distanceMeters);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('returns everything when k exceeds the dataset', () => {
    expect(queryNearest(index, { latitude: -23.55, longitude: -46.63 }, 9999)).toHaveLength(520);
  });

  it('handles empty inputs and non-positive k', () => {
    const empty = buildGridIndex<Point>([], getPoint);
    expect(queryNearest(empty, { latitude: 0, longitude: 0 }, 5)).toEqual([]);
    expect(queryNearest(index, { latitude: 0, longitude: 0 }, 0)).toEqual([]);
  });

  it('agrees with brute force regardless of cell size', () => {
    const center = { latitude: -23.3, longitude: -45.5 };
    const expected = bruteForceNearest(points, center, 10).map((r) => r.item.id);

    for (const cellSize of [0.002, DEFAULT_CELL_SIZE_DEGREES, 0.1, 1]) {
      const sized = buildGridIndex(points, getPoint, cellSize);
      expect(queryNearest(sized, center, 10).map((r) => r.item.id)).toEqual(expected);
    }
  });

  it('visits far fewer points than a full scan', () => {
    let visits = 0;
    const counting = buildGridIndex(points, (p: Point) => {
      visits += 1;
      return p;
    });
    visits = 0;
    queryNearest(counting, { latitude: -23.55, longitude: -46.63 }, 19);
    expect(visits).toBeLessThan(points.length / 2);
  });
});

describe('queryWithinRadius', () => {
  const points = makePoints(520, 99);
  const index = buildGridIndex(points, getPoint);

  it('matches brute force for a range of radii', () => {
    const center = { latitude: -23.4, longitude: -45.8 };
    for (const radius of [500, 5_000, 50_000, 200_000]) {
      const expected = points
        .filter((p) => distanceMeters(center, p) <= radius)
        .map((p) => p.id)
        .sort();
      const actual = queryWithinRadius(index, center, radius)
        .map((r) => r.item.id)
        .sort();
      expect(actual).toEqual(expected);
    }
  });

  it('returns nothing for a radius that reaches no point', () => {
    expect(queryWithinRadius(index, { latitude: 0, longitude: 0 }, 100)).toEqual([]);
  });

  it('returns results ordered by distance', () => {
    const results = queryWithinRadius(index, { latitude: -23.4, longitude: -45.8 }, 100_000);
    const distances = results.map((r) => r.distanceMeters);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });
});

describe('queryNearest with a distance bound', () => {
  const points = makePoints(520);
  const index = buildGridIndex(points, (p) => p);

  it('stops at the bound and returns fewer than k', () => {
    const origin = { latitude: -23.55, longitude: -46.63 };
    const bounded = queryNearest(index, origin, 50, 2_000);

    expect(bounded.length).toBeLessThan(50);
    for (const result of bounded) {
      expect(result.distanceMeters).toBeLessThanOrEqual(2_000);
    }
  });

  it('agrees with the unbounded query when the bound is generous', () => {
    const origin = { latitude: -23.55, longitude: -46.63 };
    const bounded = queryNearest(index, origin, 10, 10_000_000).map((r) => r.item);

    expect(bounded).toEqual(queryNearest(index, origin, 10).map((r) => r.item));
  });

  it('returns nothing when everything is beyond the bound', () => {
    expect(queryNearest(index, { latitude: 51.5, longitude: -0.12 }, 10, 1_000)).toEqual([]);
  });
});
