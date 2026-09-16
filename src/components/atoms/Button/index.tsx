import React from 'react';
import { TouchableOpacity, type TouchableOpacityProps, StyleSheet } from 'react-native';
import { Text } from '@src/components/atoms/Text';
import { colors, spacing, radius } from '@src/theme';

export interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  style,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.base, styles[variant], style]} activeOpacity={0.85} {...props}>
      <Text style={variant === 'ghost' ? styles.ghostLabel : styles.label}>
        {loading ? '...' : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: colors.error },
  label: { color: colors.textOnPrimary, fontWeight: '600' },
  ghostLabel: { color: colors.textSecondary, fontWeight: '600' },
});
