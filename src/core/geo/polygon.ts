import { distanceMeters } from './haversine';
import type { BoundingBox, LatLng, Ring } from './types';

/**
 * Point-in-polygon for room-scale rings.
 *
 * Coordinates are treated as planar (longitude = x, latitude = y). Over a
 * building footprint — tens of meters — the error from ignoring the earth's
 * curvature is far below GPS accuracy, so the simplification is free. It would
 * NOT be acceptable for rings spanning degrees, or for a ring crossing the
 * antimeridian; neither occurs here, and `ringPerimeterMeters` is available to
 * assert that at import time if you ever seed larger shapes.
 */

/** Tightest box containing the ring. Returns null for a degenerate ring. */
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

/** Shortest distance from `point` to the segment `a`→`b`, in meters. */
function distanceToSegmentMeters(point: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;

  // Degenerate segment: both endpoints coincide.
  if (dx === 0 && dy === 0) return distanceMeters(point, a);

  // Projection parameter of `point` onto the infinite line, clamped to the
  // segment. Computed in degree space, which is safe because the clamp only
  // needs to pick the nearest point — the distance itself is measured with
  // haversine afterwards.
  const t =
    ((point.longitude - a.longitude) * dx + (point.latitude - a.latitude) * dy) /
    (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));

  return distanceMeters(point, {
    latitude: a.latitude + clamped * dy,
    longitude: a.longitude + clamped * dx,
  });
}

/**
 * Whether the point sits on the ring's outline, within `toleranceMeters`.
 *
 * Ray casting is famously undefined on the boundary: whether a vertex counts as
 * inside depends on which way the ray happens to leave. Rather than inherit that
 * coin flip, `isPointInRing` tests the boundary explicitly first and treats it as
 * inside, so the answer is deterministic and the same point never flickers.
 */
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

/**
 * Crossing-number (ray casting) test. Casts a ray along +longitude and counts
 * how many edges it crosses: an odd count means inside. Handles concave rings
 * and self-touching outlines; points on the outline are inside by definition
 * (see `isPointOnRingBoundary`).
 */
export function isPointInRing(point: LatLng, ring: Ring, toleranceMeters = 0.5): boolean {
  // A ring needs at least a triangle to enclose area.
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

    // The `(yi > y) !== (yj > y)` guard uses a half-open rule on the vertical
    // span, which is what keeps a ray passing exactly through a vertex from
    // being counted twice.
    const straddlesRay = yi > y !== yj > y;
    if (!straddlesRay) continue;

    const intersectionX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < intersectionX) inside = !inside;
  }

  return inside;
}

/**
 * Bounding-box prefilter plus the full test. This is the entry point callers
 * should use: on every location fix we test a handful of rooms, and the box
 * rejects the misses in four comparisons instead of walking every edge.
 */
export function isPointInPolygon(
  point: LatLng,
  ring: Ring,
  box?: BoundingBox | null,
  toleranceMeters = 0.5,
): boolean {
  const effectiveBox = box ?? boundingBoxOfRing(ring);
  if (!effectiveBox) return false;

  // Widen the box by the tolerance so a point just outside it still gets the
  // boundary test it deserves.
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

/** Centroid of the ring's vertices. Used to anchor a room's map label. */
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

/** Perimeter of the closed ring, in meters. */
export function ringPerimeterMeters(ring: Ring): number {
  if (ring.length < 2) return 0;

  let total = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    total += distanceMeters(ring[j], ring[i]);
  }
  return total;
}
