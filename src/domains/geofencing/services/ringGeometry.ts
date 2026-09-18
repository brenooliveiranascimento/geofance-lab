import { boundingBoxOfRing, ringCentroid, type BoundingBox, type LatLng, type Ring } from '@src/core/geo';

export interface RingGeometry {
  box: BoundingBox | null;
  centroid: LatLng | null;
}

const cache = new Map<string, RingGeometry>();

export function ringGeometry(id: string, ring: Ring): RingGeometry {
  const cached = cache.get(id);
  if (cached) return cached;

  const geometry: RingGeometry = {
    box: boundingBoxOfRing(ring),
    centroid: ringCentroid(ring),
  };
  cache.set(id, geometry);
  return geometry;
}

export function invalidateGeometry(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
}
