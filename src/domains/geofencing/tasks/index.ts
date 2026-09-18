import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { logger } from '@src/core/logger';

import { GEOFENCING_TASK, LOCATION_TASK } from '@src/domains/geofencing/config';
import { handleFixes, handleRegionEvent } from '@src/domains/geofencing/services/monitorService';

interface GeofencingPayload {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

interface LocationPayload {
  locations: Location.LocationObject[];
}

TaskManager.defineTask<GeofencingPayload>(GEOFENCING_TASK, async ({ data, error }) => {
  if (error) {
    logger.error('task:regions', 'geofencing task error', { message: error.message });
    return;
  }
  if (!data) return;

  try {
    await handleRegionEvent(data.eventType, data.region);
  } catch (taskError) {
    logger.error('task:regions', 'unhandled failure', { error: String(taskError) });
  }
});

TaskManager.defineTask<LocationPayload>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logger.error('task:location', 'location task error', { message: error.message });
    return;
  }
  if (!data?.locations?.length) return;

  try {
    await handleFixes(data.locations);
  } catch (taskError) {
    logger.error('task:location', 'unhandled failure', { error: String(taskError) });
  }
});
