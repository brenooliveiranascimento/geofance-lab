import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useStore } from '@src/store';
import { colors } from '@src/theme';

export default function Index() {
  const [hydrated, setHydrated] = useState(false);
  const onboardingCompleted = useStore((s) => s.onboardingCompleted);

  useEffect(() => {
    try {
      if (!useStore.persist || useStore.persist.hasHydrated()) {
        setHydrated(true);
        return;
      }
      const timeout = setTimeout(() => setHydrated(true), 2500);
      const unsubscribe = useStore.persist.onFinishHydration(() => {
        clearTimeout(timeout);
        setHydrated(true);
      });
      return () => {
        clearTimeout(timeout);
        unsubscribe();
      };
    } catch {
      setHydrated(true);
    }
  }, []);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return <Redirect href={onboardingCompleted ? '/(tabs)' : '/(onboarding)'} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
