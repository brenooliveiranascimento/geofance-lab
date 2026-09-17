import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { DiagnosticsViewModel } from './useDiagnosticsViewModel';

const LEVEL_COLOR: Record<string, string> = {
  debug: colors.textMuted,
  info: colors.textSecondary,
  warn: colors.warning,
  error: colors.error,
};

export interface DiagnosticsViewProps {
  viewModel: DiagnosticsViewModel;
}

export function DiagnosticsView({ viewModel }: DiagnosticsViewProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <ScreenTemplate>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={viewModel.goBack}>
          <Text style={styles.back}>{t('common.close')}</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>{t('diagnostics.title')}</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('diagnostics.monitoring')}</Text>
            <Text style={styles.rowValue}>
              {t(viewModel.running ? 'common.on' : 'common.off')}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('diagnostics.regions')}</Text>
            <Text style={styles.rowValue}>
              {viewModel.registeredRegions} / {viewModel.maxNativeRegions}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('diagnostics.activeCompanies')}</Text>
            <Text style={styles.rowValue}>{viewModel.activeCompanies}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('diagnostics.companies')}</Text>
            <Text style={styles.rowValue}>{viewModel.totalCompanies}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('diagnostics.events')}</Text>
            <Text style={styles.rowValue}>{viewModel.totalEvents}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('diagnostics.tasks')}</Text>
        <View style={styles.card}>
          {viewModel.tasks.map((task) => (
            <View key={task.name} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {task.name}
              </Text>
              <Text
                style={[
                  styles.rowValue,
                  { color: task.registered ? colors.success : colors.textMuted },
                ]}
              >
                {t(task.registered ? 'diagnostics.registered' : 'diagnostics.notRegistered')}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('diagnostics.log')}</Text>
        <Text style={styles.hint}>{t('diagnostics.logHint')}</Text>

        {viewModel.log.length === 0 ? (
          <Text style={styles.hint}>{t('diagnostics.empty')}</Text>
        ) : (
          viewModel.log.map((entry) => (
            <View key={entry.id} style={styles.logRow}>
              <Text style={styles.logTime}>
                {new Date(entry.createdAt).toLocaleTimeString('pt-BR')}
              </Text>
              <View style={styles.logBody}>
                <Text style={[styles.logTag, { color: LEVEL_COLOR[entry.level] }]}>
                  {entry.tag}
                </Text>
                <Text style={styles.logMessage}>{entry.message}</Text>
                {entry.data ? (
                  <Text style={styles.logData} numberOfLines={3}>
                    {entry.data}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}

        <View style={styles.actions}>
          <Button label={t('common.refresh')} variant="secondary" onPress={viewModel.refresh} />
          <Button
            label={t('diagnostics.copy')}
            variant="secondary"
            onPress={() => void viewModel.copyLog()}
          />
          <Button label={t('diagnostics.clear')} variant="ghost" onPress={viewModel.clear} />
        </View>
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  back: { color: colors.primary, fontSize: fontSize.sm },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 17 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
  rowValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  logRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logTime: { color: colors.textMuted, fontSize: 10, width: 64, fontVariant: ['tabular-nums'] },
  logBody: { flex: 1, gap: 2 },
  logTag: { fontSize: fontSize.xs, fontWeight: '700' },
  logMessage: { color: colors.text, fontSize: fontSize.xs },
  logData: { color: colors.textMuted, fontSize: 10 },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
