import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Input, Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { PlaceFilter, PlaceRow, PlacesViewModel } from './usePlacesViewModel';

const FILTERS: PlaceFilter[] = ['all', 'inside', 'residences', 'disabled'];

const formatDistance = (meters: number | null): string => {
  if (meters === null) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
};

export interface PlacesViewProps {
  viewModel: PlacesViewModel;
}

export function PlacesView({ viewModel }: PlacesViewProps): React.JSX.Element {
  const { t } = useTranslation();

  const renderRow = useCallback(
    ({ item }: { item: PlaceRow }) => {
      const inside = item.state?.state === 'inside';

      return (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => viewModel.openPlace(item.place.id)}
        >
          <View style={[styles.dot, inside && styles.dotInside, !item.place.enabled && styles.dotOff]} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.place.name}
            </Text>
            <Text style={styles.rowMeta}>
              {t('places.radii', {
                radius: item.place.radius,
                activeRadius: item.place.activeRadius,
              })}
              {item.place.polygon ? ` · ${t('places.residence')}` : ''}
            </Text>
          </View>
          <Text style={styles.rowDistance}>{formatDistance(item.distanceMeters)}</Text>
        </TouchableOpacity>
      );
    },
    [t, viewModel],
  );

  return (
    <ScreenTemplate>
      <View style={styles.header}>
        <Text style={styles.heading}>{t('places.title')}</Text>
        <Text style={styles.subheading}>
          {t('places.subtitle', { shown: viewModel.rows.length, total: viewModel.total })}
        </Text>

        <Input
          placeholder={t('places.searchPlaceholder')}
          value={viewModel.search}
          onChangeText={viewModel.setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />

        <View style={styles.filters}>
          {FILTERS.map((filter) => {
            const active = viewModel.filter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => viewModel.setFilter(filter)}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {t(`places.filter.${filter}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList
        data={viewModel.rows}
        keyExtractor={(item) => item.place.id}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={<Text style={styles.empty}>{t('places.empty')}</Text>}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              label={t('places.create')}
              variant="secondary"
              onPress={viewModel.createPlace}
            />
            <Button
              label={t('places.reseed')}
              variant="ghost"
              loading={viewModel.busy}
              disabled={viewModel.busy}
              onPress={() => void viewModel.reseedDataset()}
            />
          </View>
        }
      />
    </ScreenTemplate>
  );
}

const ROW_HEIGHT = 64;

const styles = StyleSheet.create({
  header: { padding: spacing.md, gap: spacing.sm },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subheading: { color: colors.textSecondary, fontSize: fontSize.xs },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  dotInside: { backgroundColor: colors.success },
  dotOff: { backgroundColor: colors.error },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  rowDistance: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  empty: { color: colors.textMuted, textAlign: 'center', padding: spacing.xl },
  footer: { gap: spacing.sm, paddingTop: spacing.lg },
});
