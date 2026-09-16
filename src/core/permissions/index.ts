import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@src/core/logger';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface MonitoringPermissions {
  foregroundLocation: PermissionState;
  backgroundLocation: PermissionState;
  notifications: PermissionState;
  /** Whether the device's location services are switched on at all. */
  locationServicesEnabled: boolean;
}

/** Everything the monitor needs before it can start. */
export function isMonitoringAllowed(permissions: MonitoringPermissions): boolean {
  return (
    permissions.locationServicesEnabled &&
    permissions.foregroundLocation === 'granted' &&
    permissions.backgroundLocation === 'granted'
  );
}

const toState = (status: Location.PermissionStatus | Notifications.PermissionStatus): PermissionState => {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
};

export async function readPermissions(): Promise<MonitoringPermissions> {
  const [foreground, background, notifications, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    Location.hasServicesEnabledAsync(),
  ]);

  return {
    foregroundLocation: toState(foreground.status),
    backgroundLocation: toState(background.status),
    notifications: toState(notifications.status),
    locationServicesEnabled: servicesEnabled,
  };
}

/**
 * Requests the permissions in the only order the platforms accept.
 *
 * Both iOS and Android refuse to even show the background prompt until
 * foreground access has been granted, so a request that skips the first step
 * silently returns "denied". On Android 11+ the background grant is not a
 * dialog at all — the system sends the user to a settings page where they must
 * pick "Allow all the time" — which is why the onboarding explains what is
 * about to happen before this runs.
 */
export async function requestMonitoringPermissions(): Promise<MonitoringPermissions> {
  const foreground = await Location.requestForegroundPermissionsAsync();

  if (foreground.status !== 'granted') {
    logger.warn('permissions', 'foreground location denied', { status: foreground.status });
    return readPermissions();
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    logger.warn('permissions', 'background location denied', { status: background.status });
  }

  return readPermissions();
}

/** Android 13+ requires an explicit grant; older versions return granted. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return toState(requested.status);
}

/**
 * Android only. OEM battery managers (Xiaomi, Huawei, Samsung and friends) put
 * apps to sleep aggressively enough to kill the foreground service, and no
 * amount of correct code survives that — the user has to exempt the app. This
 * reports whether we are on a platform where that matters.
 */
export const needsBatteryOptimizationOptOut = Platform.OS === 'android';
