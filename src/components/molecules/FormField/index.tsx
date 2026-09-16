import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Input, type InputProps } from '@src/components/atoms/Input';
import { Text } from '@src/components/atoms/Text';
import { colors, spacing } from '@src/theme';

export interface FormFieldProps extends InputProps {
  label: string;
  error?: string;
}

export function FormField({ label, error, ...inputProps }: FormFieldProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text variant="label">{label}</Text>
      <Input {...inputProps} />
      {error ? (
        <Text variant="caption" color={colors.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
});
