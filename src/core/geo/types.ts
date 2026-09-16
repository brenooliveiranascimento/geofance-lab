/** A WGS84 coordinate. Field names match expo-location's `coords` on purpose. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * A single location reading. `accuracy` is the horizontal radius in meters the
 * platform reports as its 68% confidence interval; it is central to the
 * transition engine, which refuses to decide on readings it cannot trust.
 */
export interface Fix extends LatLng {
  /** Horizontal accuracy in meters. `null` when the platform does not report it. */
  accuracy: number | null;
  /** Epoch milliseconds. */
  timestamp: number;
}

/** Axis-aligned bounding box in degrees. */
export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/**
 * A closed linear ring. The last vertex is NOT repeated — closure is implicit,
 * so a triangle is exactly three entries.
 */
export type Ring = LatLng[];
