import React from 'react';
import { TextInput, type TextInputProps, StyleSheet, View } from 'react-native';
import { colors, spacing, radius, fontSize } from '@src/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ style, ...props }: InputProps): React.JSX.Element {
  return (
    <View>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: fontSize.md,
  },
});
