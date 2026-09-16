import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { GeofenceEvent } from '../../types';
import type { EventLogViewModel, EventScope } from './useEventLogViewModel';

const SCOPES: EventScope[] = ['all', 'places', 'rooms'];

export interface EventLogViewProps {
  viewModel: EventLogViewModel;
}

export function EventLogView({ viewModel }: EventLogViewProps): React.JSX.Element {
  const { t } = useTranslation();

  const renderRow = useCallback(
    ({ item }: { item: GeofenceEvent }) => {
      const entering = item.kind.endsWith('_enter');
      const when = new Date(item.occurredAt);

      return (
        <View style={styles.row}>
          <View style={[styles.marker, entering ? styles.markerIn : styles.markerOut]} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.roomName ? `${item.placeName} · ${item.roomName}` : item.placeName}
            </Text>
            <Text style={styles.rowMeta}>
              {t(`events.kind.${item.kind}`)} · {t(`events.source.${item.source}`)}
              {item.distance !== null ? ` · ${Math.round(item.distance)} m` : ''}
              {item.accuracy !== null ? ` · ±${Math.round(item.accuracy)} m` : ''}
            </Text>
          </View>
          <View style={styles.rowTime}>
            <Text style={styles.timeValue}>{when.toLocaleTimeString('pt-BR')}</Text>
            <Text style={styles.timeDate}>{when.toLocaleDateString('pt-BR')}</Text>
          </View>
        </View>
      );
    },
    [t],
  );

  return (
    <ScreenTemplate>
      <View style={styles.header}>
        <Text style={styles.heading}>{t('events.title')}</Text>
        <Text style={styles.subheading}>
          {t('events.summary', {
            total: viewModel.counts.total,
            entries: viewModel.counts.entries,
            exits: viewModel.counts.exits,
          })}
        </Text>

        <View style={styles.filters}>
          {SCOPES.map((scope) => {
            const active = viewModel.scope === scope;
            return (
              <TouchableOpacity
                key={scope}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => viewModel.setScope(scope)}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {t(`events.scope.${scope}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList
        data={viewModel.events}
        keyExtractor={(item) => item.idempotencyKey}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>{t('events.empty.title')}</Text>
            <Text style={styles.emptyBody}>{t('events.empty.body')}</Text>
          </View>
        }
        ListFooterComponent={
          viewModel.events.length > 0 ? (
            <View style={styles.footer}>
              <Button
                label={t('events.copy')}
                variant="secondary"
                onPress={() => void viewModel.copyToClipboard()}
              />
              <Button label={t('events.clear')} variant="ghost" onPress={viewModel.clear} />
            </View>
          ) : null
        }
      />
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.md, gap: spacing.sm },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subheading: { color: colors.textSecondary, fontSize: fontSize.xs },
  filters: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  chipLabel: { color: colors.textSecondary, fontSize: fontSize.xs },
  chipLabelActive: { color: colors.text, fontWeight: '600' },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  marker: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  markerIn: { backgroundColor: colors.success },
  markerOut: { backgroundColor: colors.warning },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  rowTime: { alignItems: 'flex-end' },
  timeValue: { color: colors.textSecondary, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  timeDate: { color: colors.textMuted, fontSize: 10, fontVariant: ['tabular-nums'] },
  emptyBox: { padding: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  emptyTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: { gap: spacing.sm, paddingTop: spacing.lg },
});
