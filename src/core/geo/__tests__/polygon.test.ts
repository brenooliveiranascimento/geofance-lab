import {
  boundingBoxOfRing,
  circumscribedRadiusMeters,
  distanceToRingMeters,
  findSelfIntersection,
  isSimpleRing,
  nearestVertexDistanceMeters,
  sortRingByAngle,
  isRingInsideRing,
  ringAreaSquareMeters,
  isPointInPolygon,
  isPointInRing,
  isPointOnRingBoundary,
  ringCentroid,
  ringPerimeterMeters,
  untangleRing,
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

  it('companies the centroid inside a convex room', () => {
    const centroid = ringCentroid(roomRing);
    expect(centroid).not.toBeNull();
    expect(isPointInRing(centroid!, roomRing)).toBe(true);
  });

  it('measures the room perimeter in meters', () => {
    expect(ringPerimeterMeters(roomRing)).toBeGreaterThan(40);
    expect(ringPerimeterMeters(roomRing)).toBeLessThan(46);
  });
});

describe('distanceToRingMeters', () => {
  it('is zero on the outline', () => {
    expect(distanceToRingMeters(roomRing[0], roomRing)).toBeCloseTo(0, 5);
  });

  it('measures from inside to the nearest wall', () => {
    const centroid = ringCentroid(roomRing)!;
    const distance = distanceToRingMeters(centroid, roomRing);
    expect(distance).toBeGreaterThan(4);
    expect(distance).toBeLessThan(6);
  });

  it('measures from outside as well', () => {
    const north = { latitude: roomRing[2].latitude + 0.0001, longitude: -46.62995 };
    expect(distanceToRingMeters(north, roomRing)).toBeCloseTo(11.1, 0);
  });

  it('handles degenerate rings', () => {
    expect(distanceToRingMeters(at(0, 0), [])).toBe(Infinity);
    expect(distanceToRingMeters(at(0, 0), [at(0, 1)])).toBeGreaterThan(0);
  });
});

describe('circumscribedRadiusMeters', () => {
  it('reaches the furthest vertex', () => {
    const centroid = ringCentroid(roomRing)!;
    const furthest = circumscribedRadiusMeters(roomRing, centroid);
    expect(furthest).toBeGreaterThan(7);
    expect(furthest).toBeLessThan(8);
  });

  it('contains every vertex of the ring', () => {
    const centroid = ringCentroid(uShape)!;
    const radius = circumscribedRadiusMeters(uShape, centroid);
    for (const vertex of uShape) {
      expect(distanceToRingMeters(vertex, uShape)).toBeLessThanOrEqual(radius);
    }
  });

  it('is zero for an empty ring', () => {
    expect(circumscribedRadiusMeters([], at(0, 0))).toBe(0);
  });
});

describe('isRingInsideRing', () => {
  const outer = ring([0, 0], [4, 0], [4, 4], [0, 4]);

  it('accepts a ring fully contained', () => {
    expect(isRingInsideRing(ring([1, 1], [3, 1], [3, 3], [1, 3]), outer)).toBe(true);
  });

  it('rejects a ring that pokes outside', () => {
    expect(isRingInsideRing(ring([3, 3], [5, 3], [5, 5], [3, 5]), outer)).toBe(false);
  });

  it('rejects a ring entirely outside', () => {
    expect(isRingInsideRing(ring([10, 10], [12, 10], [12, 12], [10, 12]), outer)).toBe(false);
  });

  it('accepts a ring sharing the outline', () => {
    expect(isRingInsideRing(outer, outer)).toBe(true);
  });

  it('rejects degenerate rings', () => {
    expect(isRingInsideRing([], outer)).toBe(false);
    expect(isRingInsideRing(outer, ring([0, 0], [1, 1]))).toBe(false);
  });

  it('rejects a room outside a concave notch', () => {
    expect(isRingInsideRing(ring([1.2, 1.5], [1.8, 1.5], [1.8, 2.5], [1.2, 2.5]), uShape)).toBe(false);
  });
});

describe('ringAreaSquareMeters', () => {
  it('measures a room in square meters', () => {
    const area = ringAreaSquareMeters(roomRing);
    expect(area).toBeGreaterThan(105);
    expect(area).toBeLessThan(120);
  });

  it('is independent of winding direction', () => {
    expect(ringAreaSquareMeters([...roomRing].reverse())).toBeCloseTo(
      ringAreaSquareMeters(roomRing),
      6,
    );
  });

  it('is zero for shapes that enclose nothing', () => {
    expect(ringAreaSquareMeters([])).toBe(0);
    expect(ringAreaSquareMeters(ring([0, 0], [1, 1]))).toBe(0);
  });
});

describe('findSelfIntersection', () => {
  it('accepts a simple square', () => {
    expect(findSelfIntersection(ring([0, 0], [2, 0], [2, 2], [0, 2]))).toBeNull();
    expect(isSimpleRing(ring([0, 0], [2, 0], [2, 2], [0, 2]))).toBe(true);
  });

  it('accepts a concave shape', () => {
    expect(isSimpleRing(uShape)).toBe(true);
  });

  it('catches the bowtie', () => {
    const bowtie = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    const crossing = findSelfIntersection(bowtie);

    expect(crossing).not.toBeNull();
    expect(isSimpleRing(bowtie)).toBe(false);
  });

  it('cannot be self-intersecting with three points or fewer', () => {
    expect(findSelfIntersection(ring([0, 0], [2, 0], [1, 2]))).toBeNull();
    expect(findSelfIntersection(ring([0, 0], [1, 1]))).toBeNull();
    expect(findSelfIntersection([])).toBeNull();
  });

  it('catches a tangle that only appears late in the ring', () => {
    const tangled = ring([0, 0], [4, 0], [4, 3], [1, 3], [2, -1]);
    expect(isSimpleRing(tangled)).toBe(false);
  });

  it('catches an edge that doubles back over its neighbour', () => {
    expect(isSimpleRing(ring([0, 0], [4, 0], [2, 0], [2, 3]))).toBe(false);
  });

  it('reports the pair of edges that cross', () => {
    const crossing = findSelfIntersection(ring([0, 0], [2, 2], [2, 0], [0, 2]))!;
    expect(crossing.first).toBeGreaterThanOrEqual(0);
    expect(crossing.second).toBeGreaterThan(crossing.first + 1);
  });

  it('is why the area of a tangled ring cannot be trusted', () => {
    const bowtie = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    const square = ring([0, 0], [2, 0], [2, 2], [0, 2]);

    expect(ringAreaSquareMeters(bowtie)).toBeLessThan(ringAreaSquareMeters(square) / 10);
  });
});

describe('sortRingByAngle', () => {
  it('untangles corners marked out of order', () => {
    const scrambled = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    expect(isSimpleRing(scrambled)).toBe(false);

    const fixed = sortRingByAngle(scrambled);
    expect(isSimpleRing(fixed)).toBe(true);
  });

  it('keeps every point', () => {
    const scrambled = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    const fixed = sortRingByAngle(scrambled);

    expect(fixed).toHaveLength(scrambled.length);
    for (const vertex of scrambled) {
      expect(fixed).toContainEqual(vertex);
    }
  });

  it('recovers the full area of a tangled square', () => {
    const scrambled = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    const square = ring([0, 0], [2, 0], [2, 2], [0, 2]);

    expect(ringAreaSquareMeters(sortRingByAngle(scrambled))).toBeCloseTo(
      ringAreaSquareMeters(square),
      -1,
    );
  });

  it('leaves an already simple convex ring simple', () => {
    const square = ring([0, 0], [2, 0], [2, 2], [0, 2]);
    expect(isSimpleRing(sortRingByAngle(square))).toBe(true);
  });

  it('untangles a nine-point sketch', () => {
    const messy = ring([0, 0], [3, 4], [1, 3], [4, 1], [0, 2], [2, 0], [4, 4], [1, 1], [3, 2]);
    expect(isSimpleRing(messy)).toBe(false);
    expect(isSimpleRing(sortRingByAngle(messy))).toBe(true);
  });

  it('passes short rings through untouched', () => {
    expect(sortRingByAngle(ring([0, 0], [1, 1]))).toHaveLength(2);
  });
});

describe('nearestVertexDistanceMeters', () => {
  it('finds the closest corner', () => {
    expect(nearestVertexDistanceMeters(roomRing[0], roomRing)).toBeCloseTo(0, 5);
  });

  it('is infinite for an empty ring', () => {
    expect(nearestVertexDistanceMeters(at(0, 0), [])).toBe(Infinity);
  });

  it('detects a point dropped on top of an existing one', () => {
    const almostDuplicate = {
      latitude: roomRing[1].latitude + 0.000001,
      longitude: roomRing[1].longitude,
    };
    expect(nearestVertexDistanceMeters(almostDuplicate, roomRing)).toBeLessThan(1);
  });
});

describe('untangleRing', () => {
  const lShape = ring([0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]);

  const scramble = <T,>(items: readonly T[], order: number[]): T[] =>
    order.map((index) => items[index]);

  it('untangles a scrambled square', () => {
    const scrambled = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    const fixed = untangleRing(scrambled);

    expect(isSimpleRing(fixed)).toBe(true);
    expect(ringAreaSquareMeters(fixed)).toBeCloseTo(
      ringAreaSquareMeters(ring([0, 0], [2, 0], [2, 2], [0, 2])),
      -1,
    );
  });

  it('always produces a simple ring, even from a concave point set', () => {
    const scrambled = scramble(lShape, [3, 0, 5, 1, 4, 2]);
    expect(isSimpleRing(scrambled)).toBe(false);
    expect(isSimpleRing(untangleRing(scrambled))).toBe(true);
  });

  it('cannot recover which concave shape was meant', () => {
    const scrambled = scramble(lShape, [3, 0, 5, 1, 4, 2]);
    const recovered = ringAreaSquareMeters(untangleRing(scrambled));
    const intended = ringAreaSquareMeters(lShape);

    expect(isSimpleRing(untangleRing(scrambled))).toBe(true);
    expect(recovered).not.toBeCloseTo(intended, -1);
  });

  it('keeps every point exactly once', () => {
    const scrambled = scramble(lShape, [3, 0, 5, 1, 4, 2]);
    const fixed = untangleRing(scrambled);

    expect(fixed).toHaveLength(lShape.length);
    for (const vertex of lShape) expect(fixed).toContainEqual(vertex);
  });

  it('leaves an already simple ring alone', () => {
    const square = ring([0, 0], [2, 0], [2, 2], [0, 2]);
    const fixed = untangleRing(square);
    expect(isSimpleRing(fixed)).toBe(true);
    expect(ringAreaSquareMeters(fixed)).toBeCloseTo(ringAreaSquareMeters(square), -1);
  });

  it('untangles the nine-point sketch', () => {
    const messy = ring([0, 0], [3, 4], [1, 3], [4, 1], [0, 2], [2, 0], [4, 4], [1, 1], [3, 2]);
    expect(isSimpleRing(untangleRing(messy))).toBe(true);
  });

  it('passes short rings through untouched', () => {
    expect(untangleRing(ring([0, 0], [1, 0], [0, 1]))).toHaveLength(3);
  });
});
