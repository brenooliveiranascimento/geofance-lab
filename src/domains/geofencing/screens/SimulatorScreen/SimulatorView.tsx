import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Text } from '@src/components/atoms';
import { StatusBanner } from '@src/components/organisms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { RouteKind, SimulatorViewModel } from './useSimulatorViewModel';

const ROUTE_KINDS: RouteKind[] = ['crossing', 'approach'];
const ACCURACIES = [5, 15, 40, 120];

export interface SimulatorViewProps {
  viewModel: SimulatorViewModel;
}

export function SimulatorView({ viewModel }: SimulatorViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selected, running, progress, routeLength } = viewModel;

  const percent = routeLength > 0 ? Math.round((progress / routeLength) * 100) : 0;

  return (
    <ScreenTemplate>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={viewModel.goBack}>
          <Text style={styles.back}>{t('common.close')}</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>{t('simulator.title')}</Text>
        <Text style={styles.intro}>{t('simulator.intro')}</Text>

        {viewModel.monitoringActive ? (
          <StatusBanner
            tone="warning"
            title={t('simulator.monitoringWarning.title')}
            message={t('simulator.monitoringWarning.body')}
          />
        ) : null}

        <Text style={styles.sectionTitle}>{t('simulator.pickCompany')}</Text>
        <View style={styles.companyList}>
          {viewModel.companies.slice(0, 12).map((company) => {
            const active = selected?.id === company.id;
            return (
              <TouchableOpacity
                key={company.id}
                style={[styles.companyChip, active && styles.companyChipActive]}
                onPress={() => viewModel.selectCompany(company)}
                disabled={running}
              >
                <Text style={[styles.companyChipLabel, active && styles.companyChipLabelActive]} numberOfLines={1}>
                  {company.name}
                </Text>
                <Text style={styles.companyChipMeta}>
                  {t('companies.radii', { radius: company.radius, activeRadius: company.activeRadius })}
                  {company.polygon ? ` · ${t('companies.residence')}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t('simulator.routeKind')}</Text>
        <View style={styles.row}>
          {ROUTE_KINDS.map((kind) => {
            const active = viewModel.routeKind === kind;
            return (
              <TouchableOpacity
                key={kind}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => viewModel.setRouteKind(kind)}
                disabled={running}
              >
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                  {t(`simulator.kind.${kind}.label`)}
                </Text>
                <Text style={styles.optionHint}>{t(`simulator.kind.${kind}.hint`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t('simulator.accuracy')}</Text>
        <Text style={styles.hint}>{t('simulator.accuracyHint')}</Text>
        <View style={styles.row}>
          {ACCURACIES.map((value) => {
            const active = viewModel.accuracy === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() => viewModel.setAccuracy(value)}
                disabled={running}
              >
                <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>±{value} m</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.progressBox}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {t('simulator.progress', { current: progress, total: routeLength })}
          </Text>
        </View>

        <Button
          label={running ? t('simulator.stop') : t('simulator.start')}
          variant={running ? 'destructive' : 'primary'}
          onPress={running ? viewModel.stop : viewModel.start}
          disabled={!selected}
        />
        <Text style={styles.hint}>{t('simulator.footnote')}</Text>
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  back: { color: colors.primary, fontSize: fontSize.sm },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  intro: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16 },
  companyList: { gap: spacing.xs },
  companyChip: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  companyChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  companyChipLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  companyChipLabelActive: { color: colors.text, fontWeight: '600' },
  companyChipMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  option: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  optionLabel: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  optionLabelActive: { color: colors.text },
  optionHint: { color: colors.textMuted, fontSize: fontSize.xs },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  pillLabel: { color: colors.textSecondary, fontSize: fontSize.xs },
  pillLabelActive: { color: colors.text, fontWeight: '700' },
  progressBox: { gap: spacing.xs, marginTop: spacing.md },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.primary },
  progressLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
});
