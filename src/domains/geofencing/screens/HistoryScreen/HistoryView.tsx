import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { formatTimeWithSeconds as time } from '@src/lib/format';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { GeofenceEvent } from '@src/domains/geofencing/types';
import type { EventScope, HistoryTab, HistoryViewModel } from '@src/domains/geofencing/screens/HistoryScreen/useHistoryViewModel';

const TABS: HistoryTab[] = ['events', 'system'];
const SCOPES: EventScope[] = ['all', 'companies', 'rooms'];

const LEVEL_COLOR: Record<string, string> = {
  debug: colors.textMuted,
  info: colors.textSecondary,
  warn: colors.warning,
  error: colors.error,
};

export interface HistoryViewProps {
  viewModel: HistoryViewModel;
}

export function HistoryView({ viewModel }: HistoryViewProps): React.JSX.Element {
  const { t } = useTranslation();

  const renderEvent = useCallback(
    ({ item }: { item: GeofenceEvent }) => {
      const entering = item.kind.endsWith('_enter');
      return (
        <View style={styles.row}>
          <View style={[styles.bar, entering ? styles.barIn : styles.barOut]} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.roomName ?? item.companyName}
            </Text>
            <Text style={styles.rowMeta} numberOfLines={1}>
              {t(`events.kind.${item.kind}`)}
              {item.roomName ? ` · ${item.companyName}` : ''}
            </Text>
          </View>
          <Text style={styles.rowTime}>{time(item.occurredAt)}</Text>
        </View>
      );
    },
    [t],
  );

  return (
    <ScreenTemplate>
      <View style={styles.header}>
        <TouchableOpacity onPress={viewModel.goBack} hitSlop={12}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>

        <View style={styles.segments}>
          {TABS.map((tab) => {
            const active = viewModel.tab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => viewModel.setTab(tab)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                  {t(`history.tab.${tab}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {viewModel.tab === 'events' ? (
        <>
          <View style={styles.chips}>
            {SCOPES.map((scope) => {
              const active = viewModel.scope === scope;
              return (
                <TouchableOpacity key={scope} onPress={() => viewModel.setScope(scope)} hitSlop={8}>
                  <Text style={[styles.chip, active && styles.chipActive]}>
                    {t(`events.scope.${scope}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FlatList
            data={viewModel.events}
            keyExtractor={(item) => item.idempotencyKey}
            renderItem={renderEvent}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t('history.empty.events')}</Text>}
          />
        </>
      ) : (
        <FlatList
          data={viewModel.log}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.statusBlock}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>{t('history.monitoring')}</Text>
                <Text style={[styles.statusValue, viewModel.running && styles.statusOn]}>
                  {t(viewModel.running ? 'common.on' : 'common.off')}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>{t('history.regions')}</Text>
                <Text style={styles.statusValue}>{viewModel.regions}</Text>
              </View>
              {viewModel.tasks.map((task) => (
                <View key={task.name} style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{t('history.task', { name: task.name })}</Text>
                  <Text style={[styles.statusValue, task.registered && styles.statusOn]}>
                    {t(task.registered ? 'history.registered' : 'history.notRegistered')}
                  </Text>
                </View>
              ))}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.logRow}>
              <Text style={styles.logTime}>{time(item.createdAt)}</Text>
              <View style={styles.rowBody}>
                <Text style={[styles.logTag, { color: LEVEL_COLOR[item.level] }]}>{item.tag}</Text>
                <Text style={styles.logMessage}>{item.message}</Text>
                {item.data ? (
                  <Text style={styles.logData} numberOfLines={2}>
                    {item.data}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{t('history.empty.log')}</Text>}
        />
      )}

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => void viewModel.copy()} hitSlop={8}>
          <Text style={styles.footerAction}>{t('history.copy')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={viewModel.clear} hitSlop={8}>
          <Text style={[styles.footerAction, styles.footerDanger]}>{t('history.clear')}</Text>
        </TouchableOpacity>
      </View>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md },
  back: { color: colors.primary, fontSize: fontSize.sm },
  segments: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: 7, borderRadius: radius.sm - 2, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surfaceElevated },
  segmentLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  segmentLabelActive: { color: colors.text },
  chips: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  chip: { color: colors.textMuted, fontSize: fontSize.sm },
  chipActive: { color: colors.text, fontWeight: '600' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  bar: { width: 2, alignSelf: 'stretch', borderRadius: 1 },
  barIn: { backgroundColor: colors.success },
  barOut: { backgroundColor: colors.textMuted },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  rowTime: { color: colors.textMuted, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  statusBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    marginBottom: spacing.md,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusLabel: { color: colors.textSecondary, fontSize: fontSize.xs },
  statusValue: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
  statusOn: { color: colors.success },
  logRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 7 },
  logTime: { color: colors.textMuted, fontSize: 10, width: 58, fontVariant: ['tabular-nums'] },
  logTag: { fontSize: 10, fontWeight: '700' },
  logMessage: { color: colors.text, fontSize: fontSize.xs },
  logData: { color: colors.textMuted, fontSize: 10 },
  empty: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.xl },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerAction: { color: colors.primary, fontSize: fontSize.sm },
  footerDanger: { color: colors.error },
});
