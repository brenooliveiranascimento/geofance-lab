import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@src/components/atoms';
import { colors, fontSize, radius, spacing } from '@src/theme';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'active' | 'warning';
}

export function StatCard({ label, value, hint, tone = 'neutral' }: StatCardProps): React.JSX.Element {
  return (
    <View style={[styles.card, tone !== 'neutral' && styles[tone]]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  active: { borderColor: colors.primary },
  warning: { borderColor: colors.warning },
  label: { color: colors.textMuted, fontSize: fontSize.xs },
  value: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  hint: { color: colors.textSecondary, fontSize: fontSize.xs },
});
