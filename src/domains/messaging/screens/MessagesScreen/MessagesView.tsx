import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@src/components/atoms';
import { StatCard, StatusBanner } from '@src/components/organisms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import type { MessagesViewModel } from './useMessagesViewModel';

const STATE_COLOR: Record<string, string> = {
  delivered: colors.success,
  scheduled: colors.primary,
  cancelled: colors.textMuted,
  failed: colors.error,
  pending: colors.textMuted,
};

const formatDateTime = (value: number): string =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export interface MessagesViewProps {
  viewModel: MessagesViewModel;
}

export function MessagesView({ viewModel }: MessagesViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { snapshot, plan, receipts, busy } = viewModel;

  const enrolled = snapshot?.enrolledAt != null;
  const pendingReceipts = receipts.filter((r) => r.state === 'pending').length;
  const confirmedReceipts = receipts.filter((r) => r.state === 'confirmed').length;
  const exhaustedReceipts = receipts.filter((r) => r.state === 'exhausted').length;

  return (
    <ScreenTemplate>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('messages.title')}</Text>
        <Text style={styles.intro}>{t('messages.intro')}</Text>

        {viewModel.notificationsBlocked ? (
          <StatusBanner
            tone="warning"
            title={t('messages.permissionBlocked.title')}
            message={t('messages.permissionBlocked.body')}
          />
        ) : null}

        {!enrolled ? (
          <StatusBanner tone="info" title={t('messages.notEnrolled.title')} message={t('messages.notEnrolled.body')} />
        ) : (
          <View style={styles.stats}>
            <StatCard label={t('messages.stats.scheduled')} value={String(snapshot?.scheduled ?? 0)} />
            <StatCard
              label={t('messages.stats.delivered')}
              value={String(snapshot?.delivered ?? 0)}
              tone={(snapshot?.delivered ?? 0) > 0 ? 'active' : 'neutral'}
            />
            <StatCard label={t('messages.stats.total')} value={String(plan.length)} />
          </View>
        )}

        {enrolled && snapshot?.nextMessage ? (
          <View style={styles.nextBox}>
            <Text style={styles.nextLabel}>{t('messages.next')}</Text>
            <Text style={styles.nextValue}>{formatDateTime(snapshot.nextMessage.scheduledFor)}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={enrolled ? t('messages.sync') : t('messages.signUp')}
            loading={busy}
            disabled={busy}
            onPress={() => void (enrolled ? viewModel.sync() : viewModel.signUp())}
          />
          {enrolled ? (
            <Button
              label={t('messages.reset')}
              variant="ghost"
              disabled={busy}
              onPress={() => void viewModel.reset()}
            />
          ) : null}
        </View>

        {enrolled ? (
          <>
            <Text style={styles.sectionTitle}>{t('messages.plan')}</Text>
            {plan.map((entry) => (
              <View
                key={`${entry.message.sequence}:${entry.message.position}`}
                style={styles.messageRow}
              >
                <View
                  style={[
                    styles.stateDot,
                    { backgroundColor: STATE_COLOR[entry.state] ?? colors.textMuted },
                  ]}
                />
                <View style={styles.messageBody}>
                  <Text style={styles.messageTitle} numberOfLines={1}>
                    {entry.message.title}
                  </Text>
                  <Text style={styles.messageSubtitle}>{entry.message.subtitle}</Text>
                </View>
                <View style={styles.messageMeta}>
                  <Text style={styles.messageState}>{t(`messages.state.${entry.state}`)}</Text>
                  <Text style={styles.messageTime}>
                    {formatDateTime(entry.deliveredAt ?? entry.message.scheduledFor)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>{t('messages.receipts.title')}</Text>
        <Text style={styles.hint}>
          {viewModel.endpoint
            ? t('messages.receipts.endpoint', { endpoint: viewModel.endpoint })
            : t('messages.receipts.noEndpoint')}
        </Text>

        <View style={styles.stats}>
          <StatCard label={t('messages.receipts.pending')} value={String(pendingReceipts)} />
          <StatCard
            label={t('messages.receipts.confirmed')}
            value={String(confirmedReceipts)}
            tone={confirmedReceipts > 0 ? 'active' : 'neutral'}
          />
          <StatCard
            label={t('messages.receipts.exhausted')}
            value={String(exhaustedReceipts)}
            tone={exhaustedReceipts > 0 ? 'warning' : 'neutral'}
          />
        </View>

        {exhaustedReceipts > 0 ? (
          <Button
            label={t('messages.receipts.retry')}
            variant="secondary"
            disabled={busy}
            onPress={() => void viewModel.retryReceipts()}
          />
        ) : null}

        {receipts.slice(0, 8).map((receipt) => (
          <View key={receipt.idempotencyKey} style={styles.receiptRow}>
            <Text style={styles.receiptKey}>{receipt.idempotencyKey}</Text>
            <Text style={styles.receiptMeta}>
              {t(`messages.receipts.state.${receipt.state}`)} · {t('messages.receipts.attempts', { total: receipt.attempts })}
            </Text>
          </View>
        ))}
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  intro: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  nextBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  nextLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  nextValue: { color: colors.text, fontSize: fontSize.sm, fontVariant: ['tabular-nums'] },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16 },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  messageBody: { flex: 1, gap: 2 },
  messageTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  messageSubtitle: { color: colors.textMuted, fontSize: fontSize.xs },
  messageMeta: { alignItems: 'flex-end' },
  messageState: { color: colors.textSecondary, fontSize: fontSize.xs },
  messageTime: { color: colors.textMuted, fontSize: 10, fontVariant: ['tabular-nums'] },
  receiptRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  receiptKey: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  receiptMeta: { color: colors.textMuted, fontSize: fontSize.xs },
});
