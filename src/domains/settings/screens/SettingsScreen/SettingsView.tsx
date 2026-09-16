import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Text } from '@src/components/atoms';
import { StatusBanner } from '@src/components/organisms';
import { ScreenTemplate } from '@src/components/templates';
import { APP_CONFIG } from '@src/config/app';
import type { PermissionState } from '@src/core/permissions';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { SettingsViewModel } from './useSettingsViewModel';

const STATE_COLOR: Record<PermissionState, string> = {
  granted: colors.success,
  denied: colors.error,
  undetermined: colors.warning,
};

interface RowProps {
  label: string;
  value: string;
  tone?: string;
}

function Row({ label, value, tone }: RowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

export interface SettingsViewProps {
  viewModel: SettingsViewModel;
}

export function SettingsView({ viewModel }: SettingsViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { permissions } = viewModel;

  const backgroundMissing = permissions && permissions.backgroundLocation !== 'granted';

  return (
    <ScreenTemplate>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('settings.title')}</Text>

        <Text style={styles.sectionTitle}>{t('settings.permissions.title')}</Text>
        {permissions ? (
          <View style={styles.card}>
            <Row
              label={t('settings.permissions.services')}
              value={t(permissions.locationServicesEnabled ? 'common.on' : 'common.off')}
              tone={permissions.locationServicesEnabled ? colors.success : colors.error}
            />
            <Row
              label={t('settings.permissions.foreground')}
              value={t(`permissions.state.${permissions.foregroundLocation}`)}
              tone={STATE_COLOR[permissions.foregroundLocation]}
            />
            <Row
              label={t('settings.permissions.background')}
              value={t(`permissions.state.${permissions.backgroundLocation}`)}
              tone={STATE_COLOR[permissions.backgroundLocation]}
            />
            <Row
              label={t('settings.permissions.notifications')}
              value={t(`permissions.state.${permissions.notifications}`)}
              tone={STATE_COLOR[permissions.notifications]}
            />
          </View>
        ) : null}

        {backgroundMissing ? (
          <StatusBanner
            tone="warning"
            title={t('settings.permissions.backgroundMissing.title')}
            message={t('settings.permissions.backgroundMissing.body')}
            actionLabel={t('settings.permissions.openSettings')}
            onAction={viewModel.openSystemSettings}
          />
        ) : null}

        <View style={styles.buttonRow}>
          <Button
            label={t('settings.permissions.requestLocation')}
            variant="secondary"
            onPress={() => void viewModel.requestPermissions()}
            style={styles.grow}
          />
          <Button
            label={t('settings.permissions.requestNotifications')}
            variant="secondary"
            onPress={() => void viewModel.requestNotifications()}
            style={styles.grow}
          />
        </View>

        {viewModel.showBatteryOptOut ? (
          <>
            <Text style={styles.sectionTitle}>{t('settings.battery.title')}</Text>
            <Text style={styles.hint}>{t('settings.battery.body')}</Text>
            <Button
              label={t('settings.battery.action')}
              variant="secondary"
              onPress={() => void viewModel.openBatterySettings()}
            />
          </>
        ) : null}

        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.chips}>
          {viewModel.languages.map((code) => {
            const active = viewModel.language === code;
            return (
              <TouchableOpacity
                key={code}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => viewModel.setLanguage(code)}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {t(`settings.languages.${code}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t('settings.tools.title')}</Text>
        <Button
          label={t('settings.tools.simulator')}
          variant="secondary"
          onPress={viewModel.openSimulator}
        />
        <Button
          label={t('settings.tools.diagnostics')}
          variant="secondary"
          onPress={viewModel.openDiagnostics}
        />

        <Text style={styles.sectionTitle}>{t('settings.data.title')}</Text>
        <Button
          label={t('settings.data.reseed', { total: viewModel.seedSize })}
          variant="secondary"
          loading={viewModel.busy}
          disabled={viewModel.busy}
          onPress={() => void viewModel.reseedDataset()}
        />
        <Button
          label={t('settings.data.clearEvents')}
          variant="ghost"
          onPress={viewModel.clearEventLog}
        />
        <Button
          label={t('settings.data.reset')}
          variant="destructive"
          disabled={viewModel.busy}
          onPress={viewModel.resetEverything}
        />

        <Text style={styles.sectionTitle}>{t('settings.about.title')}</Text>
        <View style={styles.card}>
          <Row label={t('settings.about.app')} value={APP_CONFIG.appName} />
          <Row label={t('settings.about.version')} value={viewModel.appVersion} />
          <Row
            label={t('settings.about.endpoint')}
            value={viewModel.deliveryEndpoint || t('settings.about.endpointEmpty')}
          />
        </View>
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
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
  rowValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600', flexShrink: 1 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  chipLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  chipLabelActive: { color: colors.text, fontWeight: '600' },
});
