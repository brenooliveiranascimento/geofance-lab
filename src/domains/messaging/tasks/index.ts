import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { logger } from '@src/core/logger';

import { drainReceipts } from '@src/domains/messaging/services/receiptSender';
import { handleNotificationReceived, reconcileSchedule } from '@src/domains/messaging/services/scheduler';
import { MESSAGING_TASK } from '@src/domains/messaging/config';

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


Notifications.addNotificationReceivedListener(handleNotificationReceived);
