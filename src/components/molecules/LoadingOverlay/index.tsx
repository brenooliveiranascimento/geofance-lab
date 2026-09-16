import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator } from '@src/components/atoms/ActivityIndicator';
import { colors } from '@src/theme';

export interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({ visible }: LoadingOverlayProps): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
});
