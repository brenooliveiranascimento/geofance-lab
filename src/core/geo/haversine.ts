import type { BoundingBox, LatLng } from './types';

/** IUGG mean earth radius, in meters. */
export const EARTH_RADIUS_M = 6371008.8;

/** Meters per degree of latitude. Constant enough for our purposes. */
export const METERS_PER_DEGREE_LATITUDE = (Math.PI / 180) * EARTH_RADIUS_M;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Meters spanned by one degree of longitude at the given latitude. Shrinks with
 * the cosine of the latitude — this is what makes a naive degree-based distance
 * wrong, and why every bounding box below is built per-latitude.
 */
export function metersPerDegreeLongitude(latitude: number): number {
  return METERS_PER_DEGREE_LATITUDE * Math.cos(toRadians(latitude));
}

/**
 * Great-circle distance in meters.
 *
 * The `asin(min(1, sqrt(h)))` form is used instead of `atan2` because it stays
 * numerically stable for the very short distances this app deals with most —
 * two points a couple of meters apart inside a room.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b.longitude - a.longitude);

  const sinHalfLat = Math.sin(deltaLat / 2);
  const sinHalfLon = Math.sin(deltaLon / 2);

  const h =
    sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Smallest box that certainly contains every point within `radiusMeters` of
 * `center`. Used as a cheap prefilter: a point outside the box cannot be within
 * the radius, and rejecting it costs four comparisons instead of a haversine.
 *
 * Longitude degrees are widened by 1/cos(latitude), clamped near the poles where
 * that ratio explodes.
 */
export function boundingBoxAround(center: LatLng, radiusMeters: number): BoundingBox {
  const deltaLat = radiusMeters / METERS_PER_DEGREE_LATITUDE;
  const metersPerLon = metersPerDegreeLongitude(center.latitude);
  // Near the poles a small distance spans every longitude; degenerate to the
  // full range rather than dividing by ~0.
  const deltaLon = metersPerLon < 1 ? 180 : radiusMeters / metersPerLon;

  return {
    minLatitude: center.latitude - deltaLat,
    maxLatitude: center.latitude + deltaLat,
    minLongitude: center.longitude - deltaLon,
    maxLongitude: center.longitude + deltaLon,
  };
}

/** Whether a point falls inside a bounding box, edges included. */
export function isInBoundingBox(point: LatLng, box: BoundingBox): boolean {
  return (
    point.latitude >= box.minLatitude &&
    point.latitude <= box.maxLatitude &&
    point.longitude >= box.minLongitude &&
    point.longitude <= box.maxLongitude
  );
}
