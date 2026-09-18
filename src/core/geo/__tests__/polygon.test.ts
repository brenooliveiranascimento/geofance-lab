import {
  findSelfIntersection,
  isSimpleRing,
  isPointInRing,
  isPointOnRingBoundary,
  untangleRing,
} from '@src/core/geo/polygon';
import type { Ring } from '@src/core/geo/types';

const ring = (...points: [number, number][]): Ring =>
  points.map(([longitude, latitude]) => ({ latitude, longitude }));

const at = (longitude: number, latitude: number) => ({ latitude, longitude });

it('rejects the notch of a concave shape', () => {
  const uShape = ring([0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]);
  expect(isPointInRing(at(1.5, 2), uShape)).toBe(false);
  expect(isPointInRing(at(0.5, 2), uShape)).toBe(true);
});

it('treats a point on an edge as inside', () => {
  const room = ring([-46.63, -23.55], [-46.6299, -23.55], [-46.6299, -23.5499], [-46.63, -23.5499]);
  const onBottomEdge = at(-46.62995, -23.55);

  expect(isPointOnRingBoundary(onBottomEdge, room)).toBe(true);
  expect(isPointInRing(onBottomEdge, room)).toBe(true);
});

it('catches a self-intersecting ring and untangles it', () => {
  const bowtie = ring([0, 0], [2, 2], [2, 0], [0, 2]);

  expect(findSelfIntersection(bowtie)).not.toBeNull();
  expect(isSimpleRing(bowtie)).toBe(false);
  expect(isSimpleRing(untangleRing(bowtie))).toBe(true);
});
