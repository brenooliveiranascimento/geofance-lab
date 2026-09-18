import {
  findSelfIntersection,
  isSimpleRing,
  isRingInsideRing,
  ringAreaSquareMeters,
  isPointInRing,
  isPointOnRingBoundary,
  untangleRing,
} from '@src/core/geo/polygon';
import type { Ring } from '@src/core/geo/types';

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

});

describe('isPointInRing — concave shapes', () => {
  it('rejects the notch of a U', () => {
    expect(isPointInRing(at(1.5, 2), uShape)).toBe(false);
  });

});

describe('isPointInRing — boundary and degenerate rings', () => {
  it('treats a point on an edge as inside', () => {
    const onBottomEdge = at(-46.62995, -23.55);
    expect(isPointOnRingBoundary(onBottomEdge, roomRing)).toBe(true);
    expect(isPointInRing(onBottomEdge, roomRing)).toBe(true);
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

});

describe('findSelfIntersection', () => {
  it('accepts a simple square', () => {
    expect(findSelfIntersection(ring([0, 0], [2, 0], [2, 2], [0, 2]))).toBeNull();
    expect(isSimpleRing(ring([0, 0], [2, 0], [2, 2], [0, 2]))).toBe(true);
  });

  it('catches the bowtie', () => {
    const bowtie = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    const crossing = findSelfIntersection(bowtie);

    expect(crossing).not.toBeNull();
    expect(isSimpleRing(bowtie)).toBe(false);
  });

  it('is why the area of a tangled ring cannot be trusted', () => {
    const bowtie = ring([0, 0], [2, 2], [2, 0], [0, 2]);
    const square = ring([0, 0], [2, 0], [2, 2], [0, 2]);

    expect(ringAreaSquareMeters(bowtie)).toBeLessThan(ringAreaSquareMeters(square) / 10);
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

  it('cannot recover which concave shape was meant', () => {
    const scrambled = scramble(lShape, [3, 0, 5, 1, 4, 2]);
    const recovered = ringAreaSquareMeters(untangleRing(scrambled));
    const intended = ringAreaSquareMeters(lShape);

    expect(isSimpleRing(untangleRing(scrambled))).toBe(true);
    expect(recovered).not.toBeCloseTo(intended, -1);
  });

});
