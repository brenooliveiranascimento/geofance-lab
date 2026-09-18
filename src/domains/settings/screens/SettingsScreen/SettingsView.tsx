import React from 'react';
import { useTranslation } from 'react-i18next';

import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Input, Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { APP_CONFIG } from '@src/config/app';
import type { PermissionState } from '@src/core/permissions';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { SettingsViewModel } from '@src/domains/settings/screens/SettingsScreen/useSettingsViewModel';

const STATE_COLOR: Record<PermissionState, string> = {
  granted: colors.success,
  denied: colors.error,
  undetermined: colors.warning,
};

interface RowProps {
  label: string;
  value: string;
  tone?: string;
  onPress?: () => void;
}

function Row({ label, value, tone, onPress }: RowProps): React.JSX.Element {
  const content = (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
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
    <ScreenTemplate underTabBar>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('settings.title')}</Text>

        <Section title={t('settings.permissions.title')}>
          {permissions ? (
            <>
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
            </>
          ) : null}

          <TouchableOpacity
            onPress={() =>
              backgroundMissing
                ? viewModel.openSystemSettings()
                : void viewModel.requestPermissions()
            }
          >
            <Text style={styles.action}>
              {backgroundMissing
                ? t('settings.permissions.openSettings')
                : t('settings.permissions.requestLocation')}
            </Text>
          </TouchableOpacity>
          {permissions?.notifications !== 'granted' ? (
            <TouchableOpacity onPress={() => void viewModel.requestNotifications()}>
              <Text style={styles.action}>{t('settings.permissions.requestNotifications')}</Text>
            </TouchableOpacity>
          ) : null}
        </Section>

        <Section title={t('settings.delivery.title')}>
          <Text style={styles.note}>{t('settings.delivery.hint')}</Text>
          <Input
            value={viewModel.deliveryDraft}
            onChangeText={viewModel.setDeliveryDraft}
            placeholder={t('settings.delivery.placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <TouchableOpacity onPress={viewModel.saveDelivery}>
            <Text style={styles.action}>{t('settings.delivery.save')}</Text>
          </TouchableOpacity>
        </Section>

        <Section title={t('settings.about.title')}>
          <Row label={t('settings.about.version')} value={viewModel.appVersion} />
          <TouchableOpacity onPress={viewModel.resetEverything} disabled={viewModel.busy}>
            <Text style={[styles.action, styles.danger]}>{t('settings.data.reset')}</Text>
          </TouchableOpacity>
        </Section>

        <Text style={styles.footer}>{APP_CONFIG.appName}</Text>
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  heading: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700', marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg, gap: spacing.sm },
  sectionTitle: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 12,
  },
  rowLabel: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
  rowValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500', flexShrink: 1 },
  action: { color: colors.primary, fontSize: fontSize.sm, paddingVertical: 12 },
  danger: { color: colors.error },
  note: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16, paddingBottom: 12 },
  ok: { color: colors.success },
  bad: { color: colors.error },
  input: { marginBottom: spacing.sm },
  inlineActions: { flexDirection: 'row', gap: spacing.lg },
  chips: { flexDirection: 'row', gap: spacing.lg, paddingVertical: 12 },
  chip: { color: colors.textMuted, fontSize: fontSize.sm },
  chipActive: { color: colors.text, fontWeight: '600' },
  footer: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
