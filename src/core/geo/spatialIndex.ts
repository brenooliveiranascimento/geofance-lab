import { METERS_PER_DEGREE_LATITUDE, distanceMeters, metersPerDegreeLongitude } from './haversine';
import type { LatLng } from './types';

/**
 * Uniform grid index over a set of geo-referenced items.
 *
 * The requirement is 500+ places, and the monitor re-selects the nearest handful
 * every time the guard region is crossed. Scanning all 500 on each pass is
 * survivable but wasteful, and it degrades linearly as the dataset grows. A grid
 * bucket keyed on truncated degrees answers the same question by visiting only
 * the cells around the query point.
 *
 * A uniform grid (rather than a k-d tree or an R-tree) is the right shape here:
 * the data is static after seeding, queries are always "nearest k to a point",
 * and the whole thing is ~120 lines with no balancing to get wrong.
 */

/** ~0.01° of latitude ≈ 1.1 km. One cell comfortably holds a neighbourhood. */
export const DEFAULT_CELL_SIZE_DEGREES = 0.01;

/** Inclusive cell-coordinate extent of the populated area. */
interface CellBounds {
  minRow: number;
  maxRow: number;
  minColumn: number;
  maxColumn: number;
}

export interface GridIndex<T> {
  cellSizeDegrees: number;
  cells: Map<string, T[]>;
  getPoint: (item: T) => LatLng;
  size: number;
  /** Null when the index is empty. */
  bounds: CellBounds | null;
}

export interface NeighborResult<T> {
  item: T;
  distanceMeters: number;
}

const cellKey = (row: number, column: number): string => `${row}:${column}`;

const cellRow = (latitude: number, cellSize: number): number => Math.floor(latitude / cellSize);

const cellColumn = (longitude: number, cellSize: number): number =>
  Math.floor(longitude / cellSize);

export function buildGridIndex<T>(
  items: readonly T[],
  getPoint: (item: T) => LatLng,
  cellSizeDegrees: number = DEFAULT_CELL_SIZE_DEGREES,
): GridIndex<T> {
  const cells = new Map<string, T[]>();
  let bounds: CellBounds | null = null;

  for (const item of items) {
    const point = getPoint(item);
    const row = cellRow(point.latitude, cellSizeDegrees);
    const column = cellColumn(point.longitude, cellSizeDegrees);

    const bucket = cells.get(cellKey(row, column));
    if (bucket) {
      bucket.push(item);
    } else {
      cells.set(cellKey(row, column), [item]);
    }

    if (bounds === null) {
      bounds = { minRow: row, maxRow: row, minColumn: column, maxColumn: column };
    } else {
      if (row < bounds.minRow) bounds.minRow = row;
      if (row > bounds.maxRow) bounds.maxRow = row;
      if (column < bounds.minColumn) bounds.minColumn = column;
      if (column > bounds.maxColumn) bounds.maxColumn = column;
    }
  }

  return { cellSizeDegrees, cells, getPoint, size: items.length, bounds };
}

/**
 * Lower bound on the distance from a point to anything in a cell `ring` steps
 * away (Chebyshev distance in cell units).
 *
 * The query point sits somewhere inside its own cell, so between it and a cell
 * `ring` steps away there are at least `ring - 1` whole cells. Converting that
 * gap to meters uses whichever axis yields the *smaller* number — longitude
 * degrees shrink towards the poles — so the bound stays conservative and the
 * search never stops early.
 */
function minDistanceAtRing(ring: number, cellSizeDegrees: number, latitude: number): number {
  if (ring <= 1) return 0;
  const metersPerDegree = Math.min(
    METERS_PER_DEGREE_LATITUDE,
    Math.max(metersPerDegreeLongitude(latitude), 1),
  );
  return (ring - 1) * cellSizeDegrees * metersPerDegree;
}

/**
 * Cells exactly `ring` steps from the centre, clipped to the populated extent.
 *
 * Clipping is what keeps a query whose origin sits far from the data cheap: the
 * ring at distance 3000 would otherwise enumerate 24000 cell keys that cannot
 * exist. Bounded this way, a whole query costs at most one pass over the
 * populated extent no matter where the origin is.
 */
function* cellsAtRing(
  centerRow: number,
  centerColumn: number,
  ring: number,
  bounds: CellBounds,
): Generator<string> {
  const topRow = centerRow - ring;
  const bottomRow = centerRow + ring;
  const leftColumn = centerColumn - ring;
  const rightColumn = centerColumn + ring;

  const firstColumn = Math.max(leftColumn, bounds.minColumn);
  const lastColumn = Math.min(rightColumn, bounds.maxColumn);

  // Horizontal edges, corners included.
  const rows = ring === 0 ? [topRow] : [topRow, bottomRow];
  for (const row of rows) {
    if (row < bounds.minRow || row > bounds.maxRow) continue;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      yield cellKey(row, column);
    }
  }

  if (ring === 0) return;

  // Vertical edges, corners excluded (already emitted above).
  const firstRow = Math.max(topRow + 1, bounds.minRow);
  const lastRow = Math.min(bottomRow - 1, bounds.maxRow);
  for (const column of [leftColumn, rightColumn]) {
    if (column < bounds.minColumn || column > bounds.maxColumn) continue;
    for (let row = firstRow; row <= lastRow; row += 1) {
      yield cellKey(row, column);
    }
  }
}

/**
 * Ring range worth visiting: anything closer than `start` or beyond `end` falls
 * entirely outside the populated extent and cannot hold an item.
 */
function ringRange(
  centerRow: number,
  centerColumn: number,
  bounds: CellBounds,
): { start: number; end: number } {
  const rowGap = Math.max(bounds.minRow - centerRow, centerRow - bounds.maxRow, 0);
  const columnGap = Math.max(bounds.minColumn - centerColumn, centerColumn - bounds.maxColumn, 0);

  return {
    start: Math.max(rowGap, columnGap),
    end: Math.max(
      Math.abs(centerRow - bounds.minRow),
      Math.abs(centerRow - bounds.maxRow),
      Math.abs(centerColumn - bounds.minColumn),
      Math.abs(centerColumn - bounds.maxColumn),
    ),
  };
}

/**
 * The `k` items closest to `center`, nearest first.
 *
 * Expands ring by ring and stops as soon as the k-th best distance found is no
 * greater than the best possible distance in the next ring — at which point no
 * unvisited cell can improve the answer. A `k` larger than the dataset simply
 * returns everything.
 */
export function queryNearest<T>(
  index: GridIndex<T>,
  center: LatLng,
  k: number,
): NeighborResult<T>[] {
  if (k <= 0 || index.size === 0 || index.bounds === null) return [];

  const { cellSizeDegrees, cells, getPoint, bounds } = index;
  const centerRow = cellRow(center.latitude, cellSizeDegrees);
  const centerColumn = cellColumn(center.longitude, cellSizeDegrees);
  const { start, end } = ringRange(centerRow, centerColumn, bounds);

  const found: NeighborResult<T>[] = [];
  let visitedItems = 0;

  for (let ring = start; ring <= end; ring += 1) {
    for (const key of cellsAtRing(centerRow, centerColumn, ring, bounds)) {
      const bucket = cells.get(key);
      if (!bucket) continue;

      for (const item of bucket) {
        found.push({ item, distanceMeters: distanceMeters(center, getPoint(item)) });
        visitedItems += 1;
      }
    }

    // Every item is accounted for — no further ring can add anything.
    if (visitedItems >= index.size) break;

    if (found.length >= k) {
      found.sort((a, b) => a.distanceMeters - b.distanceMeters);
      if (found[k - 1].distanceMeters <= minDistanceAtRing(ring + 1, cellSizeDegrees, center.latitude)) {
        break;
      }
    }
  }

  found.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return found.slice(0, k);
}

/** Every item within `radiusMeters` of `center`, nearest first. */
export function queryWithinRadius<T>(
  index: GridIndex<T>,
  center: LatLng,
  radiusMeters: number,
): NeighborResult<T>[] {
  if (index.size === 0 || index.bounds === null) return [];

  const { cellSizeDegrees, cells, getPoint, bounds } = index;
  const centerRow = cellRow(center.latitude, cellSizeDegrees);
  const centerColumn = cellColumn(center.longitude, cellSizeDegrees);
  const { start, end } = ringRange(centerRow, centerColumn, bounds);

  const results: NeighborResult<T>[] = [];

  for (let ring = start; ring <= end; ring += 1) {
    // Once the closest possible point in this ring is out of range, every
    // further ring is too.
    if (minDistanceAtRing(ring, cellSizeDegrees, center.latitude) > radiusMeters) break;

    for (const key of cellsAtRing(centerRow, centerColumn, ring, bounds)) {
      const bucket = cells.get(key);
      if (!bucket) continue;

      for (const item of bucket) {
        const distance = distanceMeters(center, getPoint(item));
        if (distance <= radiusMeters) results.push({ item, distanceMeters: distance });
      }
    }
  }

  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results;
}
