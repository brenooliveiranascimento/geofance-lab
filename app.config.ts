import type { ExpoConfig } from 'expo/config';

/**
 * Dynamic config so the Google Maps key can come from the environment instead of
 * being committed. Everything else is static — see README "Configuração".
 */

const PRIMARY = '#2563EB';
const BACKGROUND = '#0D0D0D';

// Android renders react-native-maps through the Google Maps SDK, which needs a
// key. Without it the map surface stays blank, so MonitorScreen falls back to
// list mode (see useMapAvailability) instead of showing an empty grey square.
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const LOCATION_RATIONALE =
  'O Geofence Lab usa sua localização para detectar quando você entra e sai dos ' +
  'locais e cômodos que você cadastrou, mesmo com o app fechado.';

const config: ExpoConfig = {
  name: 'Geofence Lab',
  slug: 'geofence-lab',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'geofencelab',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.brenonascimento.geofencelab',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription: LOCATION_RATIONALE,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_RATIONALE,
      NSLocationAlwaysUsageDescription: LOCATION_RATIONALE,
      // `location` keeps region monitoring and the deferred location updates
      // alive; `fetch`/`processing` back the expo-background-task reconciler
      // that tops up the notification window and drains the receipt queue.
      UIBackgroundModes: ['location', 'fetch', 'processing'],
    },
  },

  android: {
    package: 'com.brenonascimento.geofencelab',
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: PRIMARY,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.WAKE_LOCK',
    ],
    ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: BACKGROUND,
        dark: { backgroundColor: BACKGROUND },
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: LOCATION_RATIONALE,
        locationWhenInUsePermission: LOCATION_RATIONALE,
        // Adds ACCESS_BACKGROUND_LOCATION and the foreground-service plumbing.
        // Android 8+ throttles background location to a handful of fixes per
        // hour without a foreground service, which would make tier 2 useless.
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        color: PRIMARY,
        defaultChannel: 'geofence-events',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // react-native-maps pulls play-services-maps; keep the consent SDK
          // classes around so release builds don't strip them.
          extraProguardRules: '-keep class com.google.android.gms.** { *; }',
        },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    router: {},
  },
};

export default config;
