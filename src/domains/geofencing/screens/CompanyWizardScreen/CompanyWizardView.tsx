import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Input, Text } from '@src/components/atoms';
import { StatusBanner } from '@src/components/organisms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import { CrosshairMap } from '../../components/CrosshairMap';
import type { CompanyWizardViewModel } from './useCompanyWizardViewModel';

export interface CompanyWizardViewProps {
  viewModel: CompanyWizardViewModel;
}

export function CompanyWizardView({ viewModel }: CompanyWizardViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { step } = viewModel;

  if (viewModel.loading) {
    return (
      <ScreenTemplate>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.centerText}>{t('wizard.locating')}</Text>
        </View>
      </ScreenTemplate>
    );
  }

  if (!viewModel.origin) {
    return (
      <ScreenTemplate>
        <View style={styles.center}>
          <Text style={styles.stepTitle}>{t('wizard.noPosition.title')}</Text>
          <Text style={styles.stepBody}>{t('wizard.noPosition.body')}</Text>
          <Button label={t('common.back')} variant="secondary" onPress={viewModel.cancel} />
        </View>
      </ScreenTemplate>
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={step === 'name' ? viewModel.cancel : viewModel.back}>
        <Text style={styles.back}>{step === 'name' ? t('common.cancel') : t('common.back')}</Text>
      </TouchableOpacity>
      <View style={styles.progress}>
        {Array.from({ length: viewModel.stepCount }, (_, index) => (
          <View
            key={index}
            style={[styles.progressDot, index <= viewModel.stepIndex && styles.progressDotActive]}
          />
        ))}
      </View>
    </View>
  );

  if (step === 'name') {
    return (
      <ScreenTemplate>
        {header}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.stepTitle}>{t('wizard.name.title')}</Text>
          <Text style={styles.stepBody}>{t('wizard.name.body')}</Text>
          <Input
            value={viewModel.name}
            onChangeText={viewModel.setName}
            placeholder={t('wizard.name.placeholder')}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={viewModel.advance}
          />
          <Button
            label={t('common.next')}
            disabled={!viewModel.canAdvance}
            onPress={viewModel.advance}
          />
        </ScrollView>
      </ScreenTemplate>
    );
  }

  if (step === 'rooms') {
    return (
      <ScreenTemplate>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.stepTitle}>{t('wizard.rooms.title')}</Text>
          <Text style={styles.stepBody}>{t('wizard.rooms.body')}</Text>

          {viewModel.rooms.length === 0 ? (
            <StatusBanner tone="info" title={t('wizard.rooms.emptyTitle')} message={t('wizard.rooms.emptyBody')} />
          ) : (
            viewModel.rooms.map((room) => (
              <View key={room.id} style={styles.roomRow}>
                <View style={styles.roomDot} />
                <Text style={styles.roomName}>{room.name}</Text>
                <Text style={styles.roomMeta}>
                  {t('wizard.rooms.vertices', { total: room.polygon.length })}
                </Text>
                <TouchableOpacity onPress={() => viewModel.removeRoom(room.id)}>
                  <Text style={styles.remove}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <Button
            label={t('wizard.rooms.add')}
            variant="secondary"
            onPress={viewModel.startRoom}
          />
          <Button
            label={t('wizard.finish')}
            loading={viewModel.saving}
            disabled={viewModel.saving}
            onPress={() => void viewModel.finish()}
          />
        </ScrollView>
      </ScreenTemplate>
    );
  }

  if (step === 'roomName') {
    return (
      <ScreenTemplate>
        {header}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.stepTitle}>{t('wizard.roomName.title')}</Text>
          <Text style={styles.stepBody}>{t('wizard.roomName.body')}</Text>
          <Input
            value={viewModel.roomName}
            onChangeText={viewModel.setRoomName}
            placeholder={t('wizard.roomName.placeholder')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={viewModel.advance}
          />
          <Button
            label={t('wizard.roomName.save')}
            disabled={!viewModel.canAdvance}
            onPress={viewModel.advance}
          />
        </ScrollView>
      </ScreenTemplate>
    );
  }

  // Drawing: the outline of the company, or one of its rooms.
  const drawingOutline = step === 'outline';
  const ring = drawingOutline ? viewModel.outline : viewModel.draft;

  return (
    <ScreenTemplate>
      {header}
      <View style={styles.drawTop}>
        <Text style={styles.stepTitle}>
          {drawingOutline ? t('wizard.outline.title') : t('wizard.roomDraw.title')}
        </Text>
        <Text style={styles.stepBody}>
          {drawingOutline ? t('wizard.outline.body') : t('wizard.roomDraw.body')}
        </Text>
      </View>

      <View style={styles.mapFrame}>
        {viewModel.mapAvailable ? (
          <CrosshairMap
            initialCenter={viewModel.origin}
            spanMeters={drawingOutline ? 160 : 70}
            draft={ring}
            parentPolygon={drawingOutline ? null : viewModel.outline}
            siblings={drawingOutline ? [] : viewModel.rooms}
            onCenterMove={viewModel.onCenterMove}
            readoutLabel={t('wizard.crosshair')}
            invalid={viewModel.tangled}
          />
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.stepBody}>{t('monitor.mapUnavailable.body')}</Text>
          </View>
        )}
      </View>

      <View style={styles.drawBottom}>
        <Text style={styles.counter}>
          {t('wizard.counter', {
            total: ring.length,
            area: Math.round(viewModel.draftAreaSquareMeters),
          })}
        </Text>

        <View style={styles.drawActions}>
          <Button
            label={t('wizard.addPoint')}
            onPress={viewModel.addPoint}
            style={styles.grow}
          />
          <Button
            label={t('wizard.undo')}
            variant="secondary"
            disabled={ring.length === 0}
            onPress={viewModel.undoPoint}
            style={styles.grow}
          />
        </View>

        {viewModel.tangled ? (
          <StatusBanner
            tone="error"
            title={t('wizard.tangled.title')}
            message={t('wizard.tangled.body')}
            actionLabel={t('wizard.tangled.action')}
            onAction={viewModel.untangle}
          />
        ) : null}
        {viewModel.tangled ? (
          <Text style={styles.hintText}>{t('wizard.tangled.hint')}</Text>
        ) : viewModel.error && ring.length > 0 ? (
          <Text style={styles.error}>{viewModel.error}</Text>
        ) : null}

        <Button
          label={drawingOutline ? t('wizard.outline.done') : t('wizard.roomDraw.done')}
          disabled={!viewModel.canAdvance}
          onPress={viewModel.advance}
        />
      </View>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  back: { color: colors.primary, fontSize: fontSize.sm },
  progress: { flexDirection: 'row', gap: spacing.xs },
  progressDot: {
    width: 24,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
  },
  progressDotActive: { backgroundColor: colors.primary },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  centerText: { color: colors.textSecondary, fontSize: fontSize.sm },
  stepTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  stepBody: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  drawTop: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  mapFrame: { flex: 1, marginHorizontal: spacing.md, borderRadius: radius.md, overflow: 'hidden' },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  drawBottom: { padding: spacing.md, gap: spacing.sm },
  counter: { color: colors.textMuted, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  drawActions: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  hintText: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16 },
  error: { color: colors.warning, fontSize: fontSize.xs, lineHeight: 16 },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  roomDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  roomName: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  roomMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  remove: { color: colors.error, fontSize: fontSize.xs, fontWeight: '600' },
});
