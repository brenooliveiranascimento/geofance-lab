import {
  boundingBoxOfRing,
  isPointInPolygon,
  isPointInRing,
  isPointOnRingBoundary,
  ringCentroid,
  ringPerimeterMeters,
} from '../polygon';
import type { Ring } from '../types';

const ring = (...points: [number, number][]): Ring =>
  points.map(([longitude, latitude]) => ({ latitude, longitude }));

const at = (longitude: number, latitude: number) => ({ latitude, longitude });

const uShape = ring([0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]);

const roomRing = ring(
  [-46.63, -23.55],
  [-46.6299, -23.55],
  [-46.6299, -23.5499],
  [-46.63, -23.5499],
);

describe('isPointInRing — convex shapes', () => {
  const square = ring([0, 0], [2, 0], [2, 2], [0, 2]);

  it('accepts an interior point', () => {
    expect(isPointInRing(at(1, 1), square)).toBe(true);
  });

  it('rejects an exterior point', () => {
    expect(isPointInRing(at(3, 1), square)).toBe(false);
  });

  it('rejects a point aligned with the shape but past it', () => {
    expect(isPointInRing(at(-1, 1), square)).toBe(false);
  });

  it('rejects a point above the shape', () => {
    expect(isPointInRing(at(1, 3), square)).toBe(false);
  });
});

describe('isPointInRing — concave shapes', () => {
  it('rejects the notch of a U', () => {
    expect(isPointInRing(at(1.5, 2), uShape)).toBe(false);
  });

  it('accepts both arms and the base', () => {
    expect(isPointInRing(at(0.5, 2), uShape)).toBe(true);
    expect(isPointInRing(at(2.5, 2), uShape)).toBe(true);
    expect(isPointInRing(at(1.5, 0.5), uShape)).toBe(true);
  });

  it('counts correctly when the ray grazes two vertices', () => {
    expect(isPointInRing(at(0.5, 1), uShape)).toBe(true);
    expect(isPointInRing(at(1.5, 1.0001), uShape)).toBe(false);
  });

  it('rejects a point level with a convex apex but outside it', () => {
    const triangle = ring([0, 0], [2, 0], [1, 2]);
    expect(isPointInRing(at(0.5, 2), triangle)).toBe(false);
    expect(isPointInRing(at(1, 1), triangle)).toBe(true);
  });
});

describe('isPointInRing — boundary and degenerate rings', () => {
  it('treats a point on an edge as inside', () => {
    const onBottomEdge = at(-46.62995, -23.55);
    expect(isPointOnRingBoundary(onBottomEdge, roomRing)).toBe(true);
    expect(isPointInRing(onBottomEdge, roomRing)).toBe(true);
  });

  it('treats a vertex as inside', () => {
    expect(isPointInRing(roomRing[2], roomRing)).toBe(true);
  });

  it('is deterministic for every vertex of the shape', () => {
    for (const vertex of uShape) {
      expect(isPointInRing(vertex, uShape, 1e-6)).toBe(true);
    }
  });

  it('rejects everything for rings that enclose no area', () => {
    expect(isPointInRing(at(0, 0), [])).toBe(false);
    expect(isPointInRing(at(0, 0), ring([0, 0]))).toBe(false);
    expect(isPointInRing(at(0, 0), ring([0, 0], [1, 1]))).toBe(false);
  });
});

describe('isPointInPolygon — bounding box prefilter', () => {
  it('agrees with the unfiltered test across a grid', () => {
    const box = boundingBoxOfRing(uShape);
    for (let x = -0.5; x <= 3.5; x += 0.25) {
      for (let y = -0.5; y <= 3.5; y += 0.25) {
        const point = at(x, y);
        expect(isPointInPolygon(point, uShape, box)).toBe(isPointInRing(point, uShape));
      }
    }
  });

  it('short-circuits points far outside the box', () => {
    expect(isPointInPolygon(at(100, 100), roomRing)).toBe(false);
  });

  it('keeps working when no box is supplied', () => {
    expect(isPointInPolygon(at(1, 0.5), uShape)).toBe(true);
  });
});

describe('ring helpers', () => {
  it('computes the bounding box', () => {
    expect(boundingBoxOfRing(uShape)).toEqual({
      minLatitude: 0,
      maxLatitude: 3,
      minLongitude: 0,
      maxLongitude: 3,
    });
  });

  it('returns null for an empty ring', () => {
    expect(boundingBoxOfRing([])).toBeNull();
    expect(ringCentroid([])).toBeNull();
  });

  it('places the centroid inside a convex room', () => {
    const centroid = ringCentroid(roomRing);
    expect(centroid).not.toBeNull();
    expect(isPointInRing(centroid!, roomRing)).toBe(true);
  });

  it('measures the room perimeter in meters', () => {
    expect(ringPerimeterMeters(roomRing)).toBeGreaterThan(40);
    expect(ringPerimeterMeters(roomRing)).toBeLessThan(46);
  });
});
