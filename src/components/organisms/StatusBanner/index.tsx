import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@src/components/atoms';
import { colors, fontSize, radius, spacing } from '@src/theme';

export interface StatusBannerProps {
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const TONE_COLOR: Record<StatusBannerProps['tone'], string> = {
  info: colors.primary,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
};

export function StatusBanner({
  tone,
  title,
  message,
  actionLabel,
  onAction,
}: StatusBannerProps): React.JSX.Element {
  return (
    <View style={[styles.banner, { borderLeftColor: TONE_COLOR[tone] }]}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button">
          <Text style={[styles.action, { color: TONE_COLOR[tone] }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    padding: spacing.md,
  },
  body: { flex: 1, gap: spacing.xs },
  title: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  message: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  action: { fontSize: fontSize.sm, fontWeight: '700' },
});
