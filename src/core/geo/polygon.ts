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

export function ringAreaSquareMeters(ring: Ring): number {
  if (ring.length < 3) return 0;

  const origin = ringCentroid(ring)!;
  const metersPerLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((origin.latitude * Math.PI) / 180);

  let twiceArea = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xj = (ring[j].longitude - origin.longitude) * metersPerLongitude;
    const yj = (ring[j].latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE;
    const xi = (ring[i].longitude - origin.longitude) * metersPerLongitude;
    const yi = (ring[i].latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE;
    twiceArea += xj * yi - xi * yj;
  }
  return Math.abs(twiceArea) / 2;
}
