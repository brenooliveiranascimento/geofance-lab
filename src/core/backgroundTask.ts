import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { logger } from '@src/core/logger';

export const BACKGROUND_INTERVAL_MINUTES = 15;

export async function registerPeriodicTask(name: string): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(name)) return;
    await BackgroundTask.registerTaskAsync(name, {
      minimumInterval: BACKGROUND_INTERVAL_MINUTES,
    });
    logger.info('background', 'periodic task registered', { name });
  } catch (error) {
    logger.warn('background', 'could not register the periodic task', {
      name,
      error: String(error),
    });
  }
}
