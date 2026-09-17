import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Icon, Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { OnboardingViewModel } from './useOnboardingViewModel';

export interface OnboardingViewProps {
  viewModel: OnboardingViewModel;
}

export function OnboardingView({ viewModel }: OnboardingViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { step, steps, currentIndex } = viewModel;

  return (
    <ScreenTemplate>
      <View style={styles.container}>
        <View style={styles.progress}>
          {steps.map((item, index) => (
            <View
              key={item.key}
              style={[styles.progressDot, index <= currentIndex && styles.progressDotActive]}
            />
          ))}
        </View>

        <View style={styles.body}>
          <View style={styles.iconCircle}>
            <Icon name={step.icon} size={44} color={colors.primary} />
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.text}>{step.body}</Text>

          {step.bullets?.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}

          {step.action === 'location' && viewModel.permissions ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultLine}>
                {t('onboarding.location.resultForeground', {
                  status: t(`permissions.state.${viewModel.permissions.foregroundLocation}`),
                })}
              </Text>
              <Text style={styles.resultLine}>
                {t('onboarding.location.resultBackground', {
                  status: t(`permissions.state.${viewModel.permissions.backgroundLocation}`),
                })}
              </Text>
              {viewModel.permissions.backgroundLocation !== 'granted' ? (
                <Text style={styles.resultWarning}>{t('onboarding.location.resultHint')}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Button
            label={viewModel.primaryLabel}
            loading={viewModel.busy}
            disabled={viewModel.busy}
            onPress={() => void viewModel.advance()}
          />
          <TouchableOpacity onPress={viewModel.skip} disabled={viewModel.busy}>
            <Text style={styles.skip}>
              {viewModel.isLast ? t('onboarding.skipCompany') : t('onboarding.skip')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  progress: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
  progressDot: {
    width: 28,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
  },
  progressDotActive: { backgroundColor: colors.primary },
  body: { flex: 1, justifyContent: 'center', gap: spacing.md },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700', textAlign: 'center' },
  text: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 24,
    textAlign: 'center',
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  bulletText: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 21, flex: 1 },
  resultBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  resultLine: { color: colors.text, fontSize: fontSize.sm },
  resultWarning: { color: colors.warning, fontSize: fontSize.xs, lineHeight: 17 },
  footer: { gap: spacing.md },
  skip: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
});
