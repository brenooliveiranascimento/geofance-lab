export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Fix extends LatLng {
  accuracy: number | null;
  timestamp: number;
}

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export type Ring = LatLng[];
