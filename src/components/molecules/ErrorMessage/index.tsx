import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@src/components/atoms/Text';
import { colors, spacing } from '@src/theme';

export interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message }: ErrorMessageProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text color={colors.error}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md },
});
