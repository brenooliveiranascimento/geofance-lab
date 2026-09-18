import { METERS_PER_DEGREE_LATITUDE, type LatLng } from '@src/core/geo';
import type { Region } from 'react-native-maps';

const MIN_LONGITUDE_SCALE = 0.1;

export function regionFor(center: LatLng, spanMeters: number): Region {
  const latitudeDelta = spanMeters / METERS_PER_DEGREE_LATITUDE;
  const scale = Math.max(Math.cos((center.latitude * Math.PI) / 180), MIN_LONGITUDE_SCALE);

  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta / scale,
  };
}
