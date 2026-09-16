import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';

import { Button, Input, Text } from '@src/components/atoms';
import { StatusBanner } from '@src/components/organisms';
import { ScreenTemplate } from '@src/components/templates';
import { colors, fontSize, radius, spacing } from '@src/theme';

import { PlacesMap } from '../../components/PlacesMap';
import type { PlaceEditorViewModel } from './usePlaceEditorViewModel';

export interface PlaceEditorViewProps {
  viewModel: PlaceEditorViewModel;
}

export function PlaceEditorView({ viewModel }: PlaceEditorViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const { place, drawing, draft, rooms } = viewModel;

  if (viewModel.loading) {
    return (
      <ScreenTemplate>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenTemplate>
    );
  }

  if (!place) {
    return (
      <ScreenTemplate>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t('editor.noPosition')}</Text>
          <Button label={t('common.back')} variant="secondary" onPress={viewModel.goBack} />
        </View>
      </ScreenTemplate>
    );
  }

  return (
    <ScreenTemplate>
      <ScrollView
        contentContainerStyle={styles.content}
        // Taps land on the map while drawing; without this the keyboard swallows
        // the first one after editing a field.
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <TouchableOpacity onPress={viewModel.goBack}>
            <Text style={styles.back}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>
            {viewModel.isNew ? t('editor.newTitle') : t('editor.editTitle')}
          </Text>
        </View>

        <View style={styles.mapFrame}>
          {viewModel.mapAvailable ? (
            <PlacesMap
              center={place}
              places={[place]}
              rooms={rooms}
              states={viewModel.states}
              // Room scale: a house footprint is tens of meters across.
              spanMeters={drawing ? 60 : 260}
              onPressMap={drawing ? viewModel.addVertex : undefined}
              extraPolygon={drawing ? { coordinates: draft, color: colors.primary } : null}
              markers={drawing ? draft.map((point, index) => ({ id: `v${index}`, coordinate: point })) : []}
              emptyLabel={t('monitor.noPosition')}
            />
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.fallbackBody}>{t('monitor.mapUnavailable.body')}</Text>
            </View>
          )}
        </View>

        {drawing ? (
          <>
            <StatusBanner
              tone="info"
              title={t('editor.drawing.title')}
              message={t('editor.drawing.body', {
                vertices: draft.length,
                perimeter: Math.round(viewModel.draftPerimeter),
              })}
            />
            <View style={styles.drawActions}>
              <Button
                label={t('editor.drawing.finish')}
                disabled={!viewModel.canFinishDraft}
                onPress={viewModel.finishDrawing}
                style={styles.grow}
              />
              <Button
                label={t('editor.drawing.undo')}
                variant="secondary"
                disabled={draft.length === 0}
                onPress={viewModel.undoVertex}
                style={styles.grow}
              />
            </View>
            <Button
              label={t('common.cancel')}
              variant="ghost"
              onPress={viewModel.cancelDrawing}
            />
          </>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>{t('editor.fields.name')}</Text>
              <Input
                value={viewModel.name}
                onChangeText={viewModel.setName}
                placeholder={t('editor.fields.namePlaceholder')}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.grow]}>
                <Text style={styles.label}>{t('editor.fields.radius')}</Text>
                <Input
                  value={viewModel.radius}
                  onChangeText={viewModel.setRadius}
                  keyboardType="numeric"
                />
                <Text style={styles.hint}>{t('editor.fields.radiusHint')}</Text>
              </View>
              <View style={[styles.field, styles.grow]}>
                <Text style={styles.label}>{t('editor.fields.activeRadius')}</Text>
                <Input
                  value={viewModel.activeRadius}
                  onChangeText={viewModel.setActiveRadius}
                  keyboardType="numeric"
                />
                <Text style={styles.hint}>{t('editor.fields.activeRadiusHint')}</Text>
              </View>
            </View>

            {viewModel.validationError ? (
              <StatusBanner tone="error" title={viewModel.validationError} />
            ) : null}

            <View style={styles.switchRow}>
              <View style={styles.grow}>
                <Text style={styles.label}>{t('editor.fields.enabled')}</Text>
                <Text style={styles.hint}>{t('editor.fields.enabledHint')}</Text>
              </View>
              <Switch
                value={viewModel.enabled}
                onValueChange={viewModel.toggleEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            <View style={styles.roomsSection}>
              <Text style={styles.sectionTitle}>
                {t('editor.rooms.title', { total: rooms.length })}
              </Text>
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

              <Button
                label={t('editor.rooms.draw')}
                variant="secondary"
                disabled={viewModel.isNew}
                onPress={viewModel.startDrawing}
              />
              {viewModel.isNew ? (
                <Text style={styles.hint}>{t('editor.rooms.saveFirst')}</Text>
              ) : null}
            </View>

            <View style={styles.actions}>
              <Button label={t('common.save')} onPress={viewModel.save} />
              {!viewModel.isNew ? (
                <Button
                  label={t('editor.deletePlace')}
                  variant="destructive"
                  onPress={viewModel.remove}
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  titleRow: { gap: spacing.xs },
  back: { color: colors.primary, fontSize: fontSize.sm },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  mapFrame: {
    height: 260,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, padding: spacing.lg },
  fallbackBody: { color: colors.textSecondary, fontSize: fontSize.xs, textAlign: 'center', lineHeight: 18 },
  field: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  label: { color: colors.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase' },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 16 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  roomsSection: { gap: spacing.sm, marginTop: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
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
  drawActions: { flexDirection: 'row', gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  emptyTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
});
