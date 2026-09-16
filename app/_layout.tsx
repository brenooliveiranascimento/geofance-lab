import '@src/i18n';
// Registers the TaskManager tasks. These imports must stay at the top: the OS
// can launch this process purely to deliver a region event, and the task has to
// already be defined by the time the module graph finishes loading.
import '@src/domains/geofencing';
import { registerMessagingTask } from '@src/domains/messaging';

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import 'react-native-reanimated';

import { bootstrapDatabase } from '@src/core/bootstrap';
import { logger } from '@src/core/logger';
import { drainReceipts } from '@src/domains/messaging/services/receiptSender';
import {
  handleNotificationReceived,
  reconcileSchedule,
} from '@src/domains/messaging/services/scheduler';
import { queryClient } from '@src/lib/query/client';
import { ToastProvider } from '@src/lib/toast';

SplashScreen.preventAutoHideAsync();

// Schema and seed are ready before any screen mounts or any task runs.
bootstrapDatabase();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Brings the messaging module back in sync.
 *
 * Runs on launch and on every return to the foreground, because the periodic
 * background task is best-effort — the OS may not have run it for hours, or at
 * all if Background App Refresh is off. Both operations are idempotent, so
 * calling them more often than necessary costs nothing.
 */
async function catchUp(): Promise<void> {
  try {
    await reconcileSchedule();
    await drainReceipts();
  } catch (error) {
    logger.error('bootstrap', 'catch-up failed', { error: String(error) });
  }
}

export default function RootLayout() {
  useEffect(() => {
    void registerMessagingTask();
    void catchUp();
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    // Deliveries seen while the app is running are recorded immediately; the
    // reconciler catches the rest by noticing their time has passed.
    const received = Notifications.addNotificationReceivedListener(handleNotificationReceived);

    const appState = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void catchUp();
    });

    return () => {
      received.remove();
      appState.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Dark-first UI: the tokens in @src/theme assume a dark background. */}
      <ThemeProvider value={DarkTheme}>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="places/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="simulator" options={{ presentation: 'modal' }} />
            <Stack.Screen name="diagnostics" options={{ presentation: 'modal' }} />
          </Stack>
          <StatusBar style="light" />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
