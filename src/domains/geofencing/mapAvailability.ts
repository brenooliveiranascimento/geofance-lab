import { Platform } from 'react-native';

export const isMapAvailable =
  Platform.OS !== 'android' || Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
