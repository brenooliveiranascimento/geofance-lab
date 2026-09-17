import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

import { Button, Input, Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, spacing } from '@src/theme';

import type { CompaniesViewModel, CompanyRow } from './useCompaniesViewModel';

const formatDistance = (meters: number | null): string => {
  if (meters === null) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
};

export interface CompaniesViewProps {
  viewModel: CompaniesViewModel;
}

export function CompaniesView({ viewModel }: CompaniesViewProps): React.JSX.Element {
  const { t } = useTranslation();

  const renderRow = useCallback(
    ({ item }: { item: CompanyRow }) => {
      const inside = item.state?.state === 'inside';

      return (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => viewModel.openCompany(item.company.id)}
        >
          <View style={[styles.dot, inside && styles.dotInside, !item.company.enabled && styles.dotOff]} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.company.name}
            </Text>
            <Text style={styles.rowMeta}>
              {t('companies.rooms', { count: item.roomCount })} ·{' '}
              {t('companies.radii', {
                radius: item.company.radius,
                activeRadius: item.company.activeRadius,
              })}
            </Text>
            {inside ? <Text style={styles.rowInside}>{t('companies.youAreHere')}</Text> : null}
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowDistance}>{formatDistance(item.distanceMeters)}</Text>
            <Switch
              value={item.company.enabled}
              onValueChange={() => viewModel.toggleEnabled(item.company)}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </TouchableOpacity>
      );
    },
    [t, viewModel],
  );

  return (
    <ScreenTemplate>
      <View style={styles.header}>
        <Text style={styles.heading}>{t('companies.title')}</Text>
        <Text style={styles.subheading}>{t('companies.subtitle', { total: viewModel.total })}</Text>

        {viewModel.total > 6 ? (
          <Input
            placeholder={t('companies.searchPlaceholder')}
            value={viewModel.search}
            onChangeText={viewModel.setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
        ) : null}
      </View>

      <FlatList
        data={viewModel.rows}
        keyExtractor={(item) => item.company.id}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>{t('companies.empty.title')}</Text>
            <Text style={styles.emptyBody}>{t('companies.empty.body')}</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Button label={t('companies.create')} onPress={viewModel.createCompany} />
          </View>
        }
      />
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.md, gap: spacing.sm },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subheading: { color: colors.textSecondary, fontSize: fontSize.xs },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  dotInside: { backgroundColor: colors.success },
  dotOff: { backgroundColor: colors.error },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  rowInside: { color: colors.success, fontSize: fontSize.xs, fontWeight: '600' },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  rowDistance: { color: colors.textSecondary, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  emptyBox: { padding: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  emptyTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: { gap: spacing.sm, paddingTop: spacing.lg },
});
