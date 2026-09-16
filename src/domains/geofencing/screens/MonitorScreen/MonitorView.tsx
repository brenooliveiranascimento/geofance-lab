import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@src/components/atoms';
import { StatCard, StatusBanner } from '@src/components/organisms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import { PlacesMap } from '../../components/PlacesMap';
import type { MonitorViewModel } from './useMonitorViewModel';

export interface MonitorViewProps {
  viewModel: MonitorViewModel;
}

export function MonitorView({ viewModel }: MonitorViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const {
    snapshot,
    status,
    statusTitle,
    statusMessage,
    totalPlaces,
    insideNames,
    center,
    mapPlaces,
    mapRooms,
    states,
    recentEvents,
    mapAvailable,
    busy,
    needsPermission,
  } = viewModel;

  const running = snapshot?.running ?? false;

  return (
    <ScreenTemplate>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('monitor.title')}</Text>

        <StatusBanner
          tone={status === 'blocked' ? 'warning' : running ? 'success' : 'info'}
          title={statusTitle}
          message={statusMessage}
          actionLabel={needsPermission ? t('monitor.grant') : undefined}
          onAction={needsPermission ? () => void viewModel.grantPermissions() : undefined}
        />

        <View style={styles.mapFrame}>
          {mapAvailable ? (
            <PlacesMap
              center={center}
              places={mapPlaces}
              rooms={mapRooms}
              states={states}
              emptyLabel={t('monitor.noPosition')}
            />
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.fallbackTitle}>{t('monitor.mapUnavailable.title')}</Text>
              <Text style={styles.fallbackBody}>{t('monitor.mapUnavailable.body')}</Text>
            </View>
          )}
        </View>

        <View style={styles.stats}>
          <StatCard
            label={t('monitor.stats.places')}
            value={String(totalPlaces)}
            hint={t('monitor.stats.placesHint')}
          />
          <StatCard
            label={t('monitor.stats.regions')}
            value={String(snapshot?.regionCount ?? 0)}
            hint={t('monitor.stats.regionsHint')}
            tone={running ? 'active' : 'neutral'}
          />
          <StatCard
            label={t('monitor.stats.inside')}
            value={String(insideNames.length)}
            hint={insideNames[0] ?? t('monitor.stats.insideNone')}
            tone={insideNames.length > 0 ? 'active' : 'neutral'}
          />
        </View>

        {snapshot?.lastFix ? (
          <View style={styles.fixBox}>
            <Text style={styles.fixLabel}>{t('monitor.lastFix')}</Text>
            <Text style={styles.fixValue}>
              {snapshot.lastFix.latitude.toFixed(5)}, {snapshot.lastFix.longitude.toFixed(5)}
              {snapshot.lastFix.accuracy !== null
                ? ` · ±${Math.round(snapshot.lastFix.accuracy)} m`
                : ''}
            </Text>
            <Text style={styles.fixHint}>
              {new Date(snapshot.lastFix.timestamp).toLocaleTimeString('pt-BR')}
            </Text>
          </View>
        ) : null}

        {recentEvents.length > 0 ? (
          <View style={styles.recent}>
            <Text style={styles.sectionTitle}>{t('monitor.recent')}</Text>
            {recentEvents.map((event) => (
              <View key={event.idempotencyKey} style={styles.eventRow}>
                <Text style={styles.eventKind}>{t(`events.kind.${event.kind}`)}</Text>
                <Text style={styles.eventName} numberOfLines={1}>
                  {event.roomName ? `${event.placeName} · ${event.roomName}` : event.placeName}
                </Text>
                <Text style={styles.eventTime}>
                  {new Date(event.occurredAt).toLocaleTimeString('pt-BR')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={running ? t('monitor.stop') : t('monitor.start')}
            variant={running ? 'destructive' : 'primary'}
            loading={busy}
            disabled={busy}
            onPress={() => void viewModel.toggleMonitoring()}
          />
          <Button
            label={t('monitor.simulator')}
            variant="secondary"
            onPress={viewModel.openSimulator}
          />
        </View>
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  mapFrame: {
    height: 280,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fallbackTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  fallbackBody: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  fixBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fixLabel: { color: colors.textMuted, fontSize: fontSize.xs, textTransform: 'uppercase' },
  fixValue: { color: colors.text, fontSize: fontSize.sm, fontVariant: ['tabular-nums'] },
  fixHint: { color: colors.textSecondary, fontSize: fontSize.xs },
  recent: { gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  eventKind: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700', width: 92 },
  eventName: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  eventTime: { color: colors.textMuted, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
