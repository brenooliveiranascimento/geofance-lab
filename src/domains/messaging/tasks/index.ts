import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { logger } from '@src/core/logger';

import { drainReceipts } from '../services/receiptSender';
import { reconcileSchedule } from '../services/scheduler';
import { MESSAGING_TASK } from '../config';

/**
 * Periodic upkeep, registered in module scope like the geofencing tasks.
 *
 * Two jobs, both of which have to happen without the user opening the app: top
 * the notification window up as messages are delivered, and drain the receipt
 * queue. The OS decides when this actually runs — roughly every 15 minutes at
 * best, far less on a device in power saving — so neither job may depend on it
 * being timely. Both are idempotent, and both also run on foreground.
 */
TaskManager.defineTask(MESSAGING_TASK, async () => {
  try {
    const summary = await reconcileSchedule();
    const receipts = await drainReceipts();

    if (summary.scheduled > 0 || receipts.confirmed > 0) {
      logger.info('task:messaging', 'background upkeep', { summary, receipts });
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    logger.error('task:messaging', 'unhandled failure', { error: String(error) });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerMessagingTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(MESSAGING_TASK)) return;
    await BackgroundTask.registerTaskAsync(MESSAGING_TASK, { minimumInterval: 15 });
    logger.info('task:messaging', 'registered');
  } catch (error) {
    // A device with Background App Refresh switched off simply never runs it;
    // the foreground path still keeps everything correct.
    logger.warn('task:messaging', 'registration failed', { error: String(error) });
  }
}

export async function unregisterMessagingTask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(MESSAGING_TASK)) {
      await BackgroundTask.unregisterTaskAsync(MESSAGING_TASK);
    }
  } catch (error) {
    logger.warn('task:messaging', 'unregistration failed', { error: String(error) });
  }
}
