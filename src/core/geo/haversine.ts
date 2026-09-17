import type { BoundingBox, LatLng } from './types';

export const EARTH_RADIUS_M = 6371008.8;

export const METERS_PER_DEGREE_LATITUDE = (Math.PI / 180) * EARTH_RADIUS_M;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function metersPerDegreeLongitude(latitude: number): number {
  return METERS_PER_DEGREE_LATITUDE * Math.cos(toRadians(latitude));
}

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

export function boundingBoxAround(center: LatLng, radiusMeters: number): BoundingBox {
  const deltaLat = radiusMeters / METERS_PER_DEGREE_LATITUDE;
  const metersPerLon = metersPerDegreeLongitude(center.latitude);
  const deltaLon = metersPerLon < 1 ? 180 : radiusMeters / metersPerLon;

  return {
    minLatitude: center.latitude - deltaLat,
    maxLatitude: center.latitude + deltaLat,
    minLongitude: center.longitude - deltaLon,
    maxLongitude: center.longitude + deltaLon,
  };
}

export function isInBoundingBox(point: LatLng, box: BoundingBox): boolean {
  return (
    point.latitude >= box.minLatitude &&
    point.latitude <= box.maxLatitude &&
    point.longitude >= box.minLongitude &&
    point.longitude <= box.maxLongitude
  );
}
