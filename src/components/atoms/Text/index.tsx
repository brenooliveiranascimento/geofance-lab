import React from 'react';
import { Text as RNText, type TextProps, StyleSheet } from 'react-native';
import { colors, fontSize } from '@src/theme';

export interface AppTextProps extends TextProps {
  variant?: 'body' | 'title' | 'subtitle' | 'caption' | 'label';
  color?: string;
}

export function Text({ variant = 'body', color, style, ...props }: AppTextProps): React.JSX.Element {
  return (
    <RNText
      style={[styles[variant], color ? { color } : undefined, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: fontSize.md },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.lg, fontWeight: '600' },
  caption: { color: colors.textMuted, fontSize: fontSize.xs },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
});
