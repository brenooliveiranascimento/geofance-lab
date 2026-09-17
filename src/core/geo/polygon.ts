import { METERS_PER_DEGREE_LATITUDE, distanceMeters } from './haversine';
import type { BoundingBox, LatLng, Ring } from './types';

export function boundingBoxOfRing(ring: Ring): BoundingBox | null {
  if (ring.length === 0) return null;

  let minLatitude = Infinity;
  let maxLatitude = -Infinity;
  let minLongitude = Infinity;
  let maxLongitude = -Infinity;

  for (const vertex of ring) {
    if (vertex.latitude < minLatitude) minLatitude = vertex.latitude;
    if (vertex.latitude > maxLatitude) maxLatitude = vertex.latitude;
    if (vertex.longitude < minLongitude) minLongitude = vertex.longitude;
    if (vertex.longitude > maxLongitude) maxLongitude = vertex.longitude;
  }

  return { minLatitude, maxLatitude, minLongitude, maxLongitude };
}

export function distanceToSegmentMeters(point: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;

  if (dx === 0 && dy === 0) return distanceMeters(point, a);

  const t =
    ((point.longitude - a.longitude) * dx + (point.latitude - a.latitude) * dy) /
    (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));

  return distanceMeters(point, {
    latitude: a.latitude + clamped * dy,
    longitude: a.longitude + clamped * dx,
  });
}

export function isPointOnRingBoundary(
  point: LatLng,
  ring: Ring,
  toleranceMeters = 0.5,
): boolean {
  if (ring.length < 2) return false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (distanceToSegmentMeters(point, ring[j], ring[i]) <= toleranceMeters) {
      return true;
    }
  }
  return false;
}

export function isPointInRing(point: LatLng, ring: Ring, toleranceMeters = 0.5): boolean {
  if (ring.length < 3) return false;

  if (isPointOnRingBoundary(point, ring, toleranceMeters)) return true;

  const x = point.longitude;
  const y = point.latitude;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].longitude;
    const yi = ring[i].latitude;
    const xj = ring[j].longitude;
    const yj = ring[j].latitude;

    const straddlesRay = yi > y !== yj > y;
    if (!straddlesRay) continue;

    const intersectionX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < intersectionX) inside = !inside;
  }

  return inside;
}

export function isPointInPolygon(
  point: LatLng,
  ring: Ring,
  box?: BoundingBox | null,
  toleranceMeters = 0.5,
): boolean {
  const effectiveBox = box ?? boundingBoxOfRing(ring);
  if (!effectiveBox) return false;

  const latitudePadding = toleranceMeters / 111320;
  if (
    point.latitude < effectiveBox.minLatitude - latitudePadding ||
    point.latitude > effectiveBox.maxLatitude + latitudePadding ||
    point.longitude < effectiveBox.minLongitude - latitudePadding ||
    point.longitude > effectiveBox.maxLongitude + latitudePadding
  ) {
    return false;
  }

  return isPointInRing(point, ring, toleranceMeters);
}

export function ringCentroid(ring: Ring): LatLng | null {
  if (ring.length === 0) return null;

  let latitude = 0;
  let longitude = 0;
  for (const vertex of ring) {
    latitude += vertex.latitude;
    longitude += vertex.longitude;
  }
  return { latitude: latitude / ring.length, longitude: longitude / ring.length };
}

export function ringPerimeterMeters(ring: Ring): number {
  if (ring.length < 2) return 0;

  let total = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    total += distanceMeters(ring[j], ring[i]);
  }
  return total;
}

export function distanceToRingMeters(point: LatLng, ring: Ring): number {
  if (ring.length === 0) return Infinity;
  if (ring.length === 1) return distanceMeters(point, ring[0]);

  let closest = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const distance = distanceToSegmentMeters(point, ring[j], ring[i]);
    if (distance < closest) closest = distance;
  }
  return closest;
}

export function circumscribedRadiusMeters(ring: Ring, center: LatLng): number {
  let furthest = 0;
  for (const vertex of ring) {
    const distance = distanceMeters(center, vertex);
    if (distance > furthest) furthest = distance;
  }
  return furthest;
}

export function isRingInsideRing(inner: Ring, outer: Ring, toleranceMeters = 0.5): boolean {
  if (inner.length < 3 || outer.length < 3) return false;

  const box = boundingBoxOfRing(outer);
  return inner.every((vertex) => isPointInPolygon(vertex, outer, box, toleranceMeters));
}

export interface PlanarPoint {
  x: number;
  y: number;
}

export function projectToLocalMeters(ring: Ring): PlanarPoint[] {
  const origin = ringCentroid(ring);
  if (!origin) return [];

  const metersPerLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((origin.latitude * Math.PI) / 180);

  return ring.map((vertex) => ({
    x: (vertex.longitude - origin.longitude) * metersPerLongitude,
    y: (vertex.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
  }));
}

export function ringAreaSquareMeters(ring: Ring): number {
  if (ring.length < 3) return 0;

  const points = projectToLocalMeters(ring);

  let twiceArea = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    twiceArea += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(twiceArea) / 2;
}

const PLANAR_EPSILON = 1e-9;

function orientation(a: PlanarPoint, b: PlanarPoint, c: PlanarPoint): number {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(cross) < PLANAR_EPSILON) return 0;
  return cross > 0 ? 1 : -1;
}

function withinBounds(a: PlanarPoint, b: PlanarPoint, point: PlanarPoint): boolean {
  return (
    point.x >= Math.min(a.x, b.x) - PLANAR_EPSILON &&
    point.x <= Math.max(a.x, b.x) + PLANAR_EPSILON &&
    point.y >= Math.min(a.y, b.y) - PLANAR_EPSILON &&
    point.y <= Math.max(a.y, b.y) + PLANAR_EPSILON
  );
}

function segmentsIntersect(
  a: PlanarPoint,
  b: PlanarPoint,
  c: PlanarPoint,
  d: PlanarPoint,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && withinBounds(a, b, c)) return true;
  if (o2 === 0 && withinBounds(a, b, d)) return true;
  if (o3 === 0 && withinBounds(c, d, a)) return true;
  if (o4 === 0 && withinBounds(c, d, b)) return true;

  return false;
}

export interface RingCrossing {
  first: number;
  second: number;
}

export function findSelfIntersection(ring: Ring): RingCrossing | null {
  if (ring.length < 4) return null;

  const points = projectToLocalMeters(ring);
  const count = points.length;

  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];

    for (let j = i + 1; j < count; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === count - 1);
      if (adjacent) continue;

      if (segmentsIntersect(a, b, points[j], points[(j + 1) % count])) {
        return { first: i, second: j };
      }
    }
  }

  return null;
}

export const isSimpleRing = (ring: Ring): boolean => findSelfIntersection(ring) === null;

export function sortRingByAngle(ring: Ring): Ring {
  if (ring.length < 3) return [...ring];

  const points = projectToLocalMeters(ring);

  return ring
    .map((vertex, index) => ({
      vertex,
      angle: Math.atan2(points[index].y, points[index].x),
      distance: Math.hypot(points[index].x, points[index].y),
    }))
    .sort((a, b) => a.angle - b.angle || a.distance - b.distance)
    .map((entry) => entry.vertex);
}

const MAX_UNTANGLE_PASSES = 40;

export function untangleRing(ring: Ring): Ring {
  if (ring.length < 4) return [...ring];

  const points = projectToLocalMeters(ring);
  const count = points.length;
  const gap = (a: number, b: number) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);

  const order = sortRingByAngle(ring).map((vertex) => ring.indexOf(vertex));

  let improved = true;
  let passes = 0;

  while (improved && passes < MAX_UNTANGLE_PASSES) {
    improved = false;
    passes += 1;

    for (let i = 0; i < count - 1; i += 1) {
      for (let j = i + 2; j < count; j += 1) {
        if (i === 0 && j === count - 1) continue;

        const a = order[i];
        const b = order[i + 1];
        const c = order[j];
        const d = order[(j + 1) % count];

        const delta = gap(a, c) + gap(b, d) - gap(a, b) - gap(c, d);
        if (delta < -PLANAR_EPSILON) {
          let left = i + 1;
          let right = j;
          while (left < right) {
            const swap = order[left];
            order[left] = order[right];
            order[right] = swap;
            left += 1;
            right -= 1;
          }
          improved = true;
        }
      }
    }
  }

  return order.map((index) => ring[index]);
}

export function nearestVertexDistanceMeters(point: LatLng, ring: Ring): number {
  let closest = Infinity;
  for (const vertex of ring) {
    const distance = distanceMeters(point, vertex);
    if (distance < closest) closest = distance;
  }
  return closest;
}
