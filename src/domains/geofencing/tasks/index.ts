import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { logger } from '@src/core/logger';

import { GEOFENCING_TASK, LOCATION_TASK } from '../config';
import { handleFixes, handleRegionEvent } from '../services/monitorService';

/**
 * Background task definitions.
 *
 * These must be registered in module scope of a file the app imports on every
 * launch — including the launches the OS performs by itself to deliver a region
 * event, where no React tree is ever mounted. Registering them from inside a
 * component would mean the task is missing in exactly the situation it exists
 * for. `src/domains/geofencing/index.ts` re-exports this module and the root
 * layout imports it first.
 */

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
    // Throwing here is invisible to the user and, on iOS, counts against the
    // app's background execution budget. Log it and let the next event retry.
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
