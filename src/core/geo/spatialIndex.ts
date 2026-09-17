import { METERS_PER_DEGREE_LATITUDE, distanceMeters, metersPerDegreeLongitude } from './haversine';
import type { LatLng } from './types';

export const DEFAULT_CELL_SIZE_DEGREES = 0.01;

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

function minDistanceAtRing(ring: number, cellSizeDegrees: number, latitude: number): number {
  if (ring <= 1) return 0;
  const metersPerDegree = Math.min(
    METERS_PER_DEGREE_LATITUDE,
    Math.max(metersPerDegreeLongitude(latitude), 1),
  );
  return (ring - 1) * cellSizeDegrees * metersPerDegree;
}

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

  const rows = ring === 0 ? [topRow] : [topRow, bottomRow];
  for (const row of rows) {
    if (row < bounds.minRow || row > bounds.maxRow) continue;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      yield cellKey(row, column);
    }
  }

  if (ring === 0) return;

  const firstRow = Math.max(topRow + 1, bounds.minRow);
  const lastRow = Math.min(bottomRow - 1, bounds.maxRow);
  for (const column of [leftColumn, rightColumn]) {
    if (column < bounds.minColumn || column > bounds.maxColumn) continue;
    for (let row = firstRow; row <= lastRow; row += 1) {
      yield cellKey(row, column);
    }
  }
}

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
