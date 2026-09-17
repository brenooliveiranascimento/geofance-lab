import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@src/core/logger';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface MonitoringPermissions {
  foregroundLocation: PermissionState;
  backgroundLocation: PermissionState;
  notifications: PermissionState;
  locationServicesEnabled: boolean;
}

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

export async function requestNotificationPermission(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return toState(requested.status);
}

export const needsBatteryOptimizationOptOut = Platform.OS === 'android';
