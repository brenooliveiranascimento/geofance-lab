import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { logger } from '@src/core/logger';

import { drainReceipts } from '../services/receiptSender';
import { reconcileSchedule } from '../services/scheduler';
import { MESSAGING_TASK } from '../config';

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
    logger.warn('task:messaging', 'registration failed', { error: String(error) });
  }
}

