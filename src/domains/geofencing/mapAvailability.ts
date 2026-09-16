import { Platform } from 'react-native';

/**
 * Whether an interactive map can render.
 *
 * react-native-maps draws through the Google Maps SDK on Android, which refuses
 * to render without an API key and leaves a blank grey surface rather than
 * failing loudly. iOS uses MapKit and needs no key. When the key is missing the
 * screens fall back to list mode, so a build without one is degraded rather than
 * broken — which matters because the key cannot be committed.
 */
export const isMapAvailable =
  Platform.OS !== 'android' || Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);
