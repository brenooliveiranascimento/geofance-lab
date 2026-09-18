import '@src/i18n';
import { resumeMonitoringIfNeeded } from '@src/domains/geofencing';

import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance, AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { registerPeriodicTask } from '@src/core/backgroundTask';
import { logger } from '@src/core/logger';
import { UPKEEP_TASK } from '@src/domains/geofencing/config';
import { MESSAGING_TASK } from '@src/domains/messaging/config';
import { drainReceipts } from '@src/domains/messaging/services/receiptSender';
import {
  handleNotificationReceived,
  reconcileSchedule,
} from '@src/domains/messaging/services/scheduler';
import { queryClient } from '@src/lib/query/client';
import { ToastProvider } from '@src/lib/toast';
import { colors } from '@src/theme';

Appearance.setColorScheme('dark');

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function catchUp(): Promise<void> {
  try {
    await resumeMonitoringIfNeeded();
  } catch (error) {
    logger.error('startup', 'could not resume monitoring', { error: String(error) });
  }

  try {
    await reconcileSchedule();
    await drainReceipts();
  } catch (error) {
    logger.error('startup', 'catch-up failed', { error: String(error) });
  }
}

export default function RootLayout() {
  useEffect(() => {
    void registerPeriodicTask(MESSAGING_TASK);
    void registerPeriodicTask(UPKEEP_TASK);
    void catchUp();
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(handleNotificationReceived);

    const appState = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void catchUp();
    });

    const network = Network.addNetworkStateListener(({ isInternetReachable }) => {
      if (isInternetReachable) void drainReceipts();
    });

    return () => {
      received.remove();
      appState.remove();
      network.remove();
    };
  }, []);

  return (
    <SafeAreaProvider style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={NAVIGATION_THEME}>
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: styles.root }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="companies/[id]" options={{ presentation: 'card' }} />
              <Stack.Screen name="simulator" options={{ presentation: 'modal' }} />
            </Stack>
            <StatusBar style="light" backgroundColor={colors.background} />
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const NAVIGATION_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background },
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
