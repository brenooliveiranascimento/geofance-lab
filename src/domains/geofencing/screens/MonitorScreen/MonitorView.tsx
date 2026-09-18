import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Text } from '@src/components/atoms';
import { ScreenTemplate } from '@src/components/templates';
import { formatTime } from '@src/lib/format';
import { colors, fontSize, radius, spacing } from '@src/theme';

import { CompaniesMap } from '@src/domains/geofencing/components/CompaniesMap';
import type { MonitorViewModel } from '@src/domains/geofencing/screens/MonitorScreen/useMonitorViewModel';

const DOT_COLOR: Record<string, string> = {
  idle: colors.textMuted,
  empty: colors.textMuted,
  blocked: colors.warning,
  busy: colors.textMuted,
  regions: colors.primary,
  precise: colors.success,
};

export interface MonitorViewProps {
  viewModel: MonitorViewModel;
}

export function MonitorView({ viewModel }: MonitorViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { status, lastEvent, running } = viewModel;

  return (
    <ScreenTemplate underTabBar>
      <View style={styles.map}>
        {viewModel.mapAvailable && viewModel.center ? (
          <CompaniesMap
            center={viewModel.mapFocus}
            companies={viewModel.mapCompanies}
            rooms={viewModel.mapRooms}
            states={viewModel.states}
            spanMeters={viewModel.mapSpanMeters}
            emptyLabel=""
            onRecenter={viewModel.recenter}
            recenterLabel={t('monitor.recenter')}
          />
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.fallbackText}>
              {viewModel.mapAvailable ? t('monitor.noPosition') : t('monitor.mapUnavailable.body')}
            </Text>
          </View>
        )}

        <View style={styles.overlayTop} pointerEvents="box-none">
          <View style={styles.statusPill} pointerEvents="none">
            <View style={[styles.dot, { backgroundColor: DOT_COLOR[status] ?? colors.textMuted }]} />
            <View style={styles.statusText}>
              <Text style={styles.statusLabel}>{viewModel.statusLabel}</Text>
              {viewModel.statusDetail ? (
                <Text style={styles.statusDetail} numberOfLines={1}>
                  {viewModel.statusDetail}
                </Text>
              ) : null}
            </View>
          </View>

          {lastEvent ? (
            <TouchableOpacity
              style={styles.eventPill}
              onPress={viewModel.openHistory}
              activeOpacity={0.8}
            >
              <Text style={styles.eventKind}>{t(`events.kind.${lastEvent.kind}`)}</Text>
              <Text style={styles.eventName} numberOfLines={1}>
                {lastEvent.roomName ?? lastEvent.companyName}
              </Text>
              <Text style={styles.eventTime}>
                {formatTime(lastEvent.occurredAt)}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        {status === 'blocked' ? (
          <Button label={t('monitor.grant')} onPress={() => void viewModel.grantPermissions()} />
        ) : status === 'empty' ? (
          <Button label={t('monitor.addCompany')} onPress={viewModel.openCompanies} />
        ) : (
          <Button
            label={running ? t('monitor.stop') : t('monitor.start')}
            variant={running ? 'destructive' : 'primary'}
            loading={viewModel.busy}
            disabled={viewModel.busy}
            onPress={() => void viewModel.toggleMonitoring()}
          />
        )}

        <View style={styles.links}>
          <TouchableOpacity onPress={viewModel.openHistory} hitSlop={10}>
            <Text style={styles.link}>{t('monitor.history')}</Text>
          </TouchableOpacity>
          <Text style={styles.linkDivider}>·</Text>
          <TouchableOpacity onPress={viewModel.openSimulator} hitSlop={10}>
            <Text style={styles.link}>{t('monitor.simulator')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, overflow: 'hidden' },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  fallbackText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  overlayTop: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.overlayStrong,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flex: 1 },
  statusLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  statusDetail: { color: colors.text, opacity: 0.7, fontSize: fontSize.xs, marginTop: 1 },
  eventPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.overlayStrong,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  eventKind: { color: colors.success, fontSize: fontSize.xs, fontWeight: '700' },
  eventName: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  eventTime: { color: colors.textMuted, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  actions: { padding: spacing.md, gap: spacing.md },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  link: { color: colors.textSecondary, fontSize: fontSize.sm },
  linkDivider: { color: colors.textMuted, fontSize: fontSize.sm },
});
