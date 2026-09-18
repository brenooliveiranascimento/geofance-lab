import React from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { colors, fontSize, radius, spacing } from '@src/theme';

export type InputProps = TextInputProps;

export function Input({ style, ...props }: InputProps): React.JSX.Element {
  return (
    <TextInput placeholderTextColor={colors.textMuted} style={[styles.input, style]} {...props} />
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
