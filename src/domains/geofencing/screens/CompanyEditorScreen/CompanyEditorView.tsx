import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Button, Input, Text } from '@src/components/atoms';
import { StatusBanner } from '@src/components/organisms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import { CompaniesMap } from '../../components/CompaniesMap';
import { CrosshairMap } from '../../components/CrosshairMap';
import type { CompanyEditorViewModel } from './useCompanyEditorViewModel';

export interface CompanyEditorViewProps {
  viewModel: CompanyEditorViewModel;
}

export function CompanyEditorView({ viewModel }: CompanyEditorViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { company, mode, rooms } = viewModel;

  if (viewModel.loading || !company) {
    return (
      <ScreenTemplate>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenTemplate>
    );
  }

  const inside = viewModel.states.get(company.id)?.state === 'inside';
  const drawing = mode === 'outlineDraw' || mode === 'roomDraw';

  if (drawing) {
    const redrawingOutline = mode === 'outlineDraw';
    return (
      <ScreenTemplate>
        <View style={styles.drawTop}>
          <TouchableOpacity onPress={viewModel.cancelDraft}>
            <Text style={styles.back}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>
            {redrawingOutline ? t('editor.outlineRedraw') : t('wizard.roomDraw.title')}
          </Text>
          <Text style={styles.hint}>
            {redrawingOutline ? t('editor.outlineRedrawHint') : t('wizard.roomDraw.body')}
          </Text>
        </View>

        <View style={styles.mapFill}>
          {viewModel.mapAvailable ? (
            <CrosshairMap
              key={mode}
              initialCenter={company}
              spanMeters={Math.max(company.activeRadius * 3, 60)}
              draft={viewModel.draft}
              parentPolygon={redrawingOutline ? null : company.polygon}
              siblings={redrawingOutline ? [] : rooms}
              onCenterMove={viewModel.onCenterMove}
              readoutLabel={t('wizard.crosshair')}
              invalid={viewModel.tangled}
            />
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.hint}>{t('monitor.mapUnavailable.body')}</Text>
            </View>
          )}
        </View>

        <View style={styles.drawBottom}>
          <Text style={styles.counter}>
            {t('wizard.counter', {
              total: viewModel.draft.length,
              area: Math.round(viewModel.draftAreaSquareMeters),
            })}
          </Text>
          <View style={styles.rowGap}>
            <Button label={t('wizard.addPoint')} onPress={viewModel.addPoint} style={styles.grow} />
            <Button
              label={t('wizard.undo')}
              variant="secondary"
              disabled={viewModel.draft.length === 0}
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
          ) : viewModel.error && viewModel.draft.length > 0 ? (
            <Text style={styles.error}>{viewModel.error}</Text>
          ) : null}
          <Button
            label={t('common.save')}
            disabled={!viewModel.canCommitDraft}
            onPress={viewModel.commitDraft}
          />
        </View>
      </ScreenTemplate>
    );
  }

  if (mode === 'roomName') {
    return (
      <ScreenTemplate>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={viewModel.cancelDraft}>
            <Text style={styles.back}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>{t('wizard.roomName.title')}</Text>
          <Text style={styles.hint}>{t('wizard.roomName.body')}</Text>
          <Input
            value={viewModel.roomName}
            onChangeText={viewModel.setRoomName}
            placeholder={t('wizard.roomName.placeholder')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={viewModel.saveRoomName}
          />
          <Button
            label={t('wizard.roomName.save')}
            disabled={!viewModel.canCommitDraft}
            onPress={viewModel.saveRoomName}
          />
        </ScrollView>
      </ScreenTemplate>
    );
  }

  return (
    <ScreenTemplate>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={viewModel.goBack}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>{company.name}</Text>

        {inside ? (
          <StatusBanner tone="success" title={t('companies.youAreHere')} />
        ) : null}

        <View style={styles.mapFrame}>
          {viewModel.mapAvailable ? (
            <CompaniesMap
              center={company}
              companies={[company]}
              rooms={rooms}
              states={viewModel.states}
              spanMeters={Math.max(company.activeRadius * 4, 160)}
              emptyLabel={t('monitor.noPosition')}
            />
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.hint}>{t('monitor.mapUnavailable.body')}</Text>
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('editor.fields.name')}</Text>
          <Input value={viewModel.name} onChangeText={viewModel.setName} />
          <Button label={t('common.save')} variant="secondary" onPress={viewModel.saveName} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>{t('editor.fields.radius')}</Text>
            <Text style={styles.cardValue}>{Math.round(company.radius)} m</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>{t('editor.fields.activeRadius')}</Text>
            <Text style={styles.cardValue}>{Math.round(company.activeRadius)} m</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>{t('editor.fields.vertices')}</Text>
            <Text style={styles.cardValue}>{company.polygon?.length ?? 0}</Text>
          </View>
          <Text style={styles.hint}>{t('editor.derivedHint')}</Text>
        </View>

        <Button
          label={t('editor.outlineRedraw')}
          variant="secondary"
          onPress={viewModel.startOutlineRedraw}
        />

        <Text style={styles.sectionTitle}>{t('editor.rooms.title', { total: rooms.length })}</Text>
        <Text style={styles.hint}>{t('editor.rooms.explainer')}</Text>

        {rooms.map((room) => (
          <View key={room.id} style={styles.roomRow}>
            <View
              style={[
                styles.roomDot,
                viewModel.states.get(room.id)?.state === 'inside' && styles.roomDotInside,
              ]}
            />
            <Text style={styles.roomName}>{room.name}</Text>
            <Text style={styles.roomMeta}>
              {t('editor.rooms.vertices', { total: room.polygon.length })}
            </Text>
            <TouchableOpacity onPress={() => viewModel.removeRoom(room)}>
              <Text style={styles.remove}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <Button label={t('editor.rooms.draw')} variant="secondary" onPress={viewModel.startRoom} />
        <Button
          label={t('editor.deleteCompany')}
          variant="destructive"
          onPress={viewModel.removeCompany}
        />
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.primary, fontSize: fontSize.sm },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16 },
  mapFrame: {
    height: 240,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapFill: { flex: 1, marginHorizontal: spacing.md, borderRadius: radius.md, overflow: 'hidden' },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  field: { gap: spacing.xs },
  label: { color: colors.textSecondary, fontSize: fontSize.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  cardValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  roomDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  roomDotInside: { backgroundColor: colors.success },
  roomName: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  roomMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  remove: { color: colors.error, fontSize: fontSize.xs, fontWeight: '600' },
  drawTop: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  drawBottom: { padding: spacing.md, gap: spacing.sm },
  counter: { color: colors.textMuted, fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  rowGap: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  hintText: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16 },
  error: { color: colors.warning, fontSize: fontSize.xs, lineHeight: 16 },
});
