import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { ringPerimeterMeters, type LatLng, type Ring } from '@src/core/geo';
import { useToast } from '@src/lib/toast';

import { isMapAvailable } from '../../mapAvailability';
import { invalidateGeofencingData } from '../../queries/invalidate';
import { usePlaceStates } from '../../queries/usePlaceStates';
import { getCurrentFix, refreshMonitoring } from '../../services/monitorService';
import {
  deletePlace,
  deleteRoom,
  getPlace,
  listRooms,
  upsertPlace,
  upsertRoom,
} from '../../services/placeRepository';
import type { Place, Room, TargetState } from '../../types';

/** A room needs at least a triangle to enclose any area. */
const MIN_ROOM_VERTICES = 3;

export interface PlaceEditorViewModel {
  isNew: boolean;
  loading: boolean;
  name: string;
  setName: (value: string) => void;
  radius: string;
  setRadius: (value: string) => void;
  activeRadius: string;
  setActiveRadius: (value: string) => void;
  enabled: boolean;
  toggleEnabled: () => void;
  place: Place | null;
  rooms: Room[];
  states: Map<string, TargetState>;
  mapAvailable: boolean;
  /** Vertices collected so far while drawing. */
  draft: Ring;
  drawing: boolean;
  canFinishDraft: boolean;
  draftPerimeter: number;
  validationError: string | null;
  startDrawing: () => void;
  cancelDrawing: () => void;
  addVertex: (point: LatLng) => void;
  undoVertex: () => void;
  finishDrawing: () => void;
  removeRoom: (room: Room) => void;
  save: () => void;
  remove: () => void;
  goBack: () => void;
}

export function usePlaceEditorViewModel(): PlaceEditorViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const isNew = id === 'new';

  const [loading, setLoading] = useState(true);
  const [place, setPlace] = useState<Place | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('');
  const [radius, setRadius] = useState('60');
  const [activeRadius, setActiveRadius] = useState('100');
  const [enabled, setEnabled] = useState(true);
  const [draft, setDraft] = useState<Ring>([]);
  const [drawing, setDrawing] = useState(false);

  const { data: states = new Map<string, TargetState>() } = usePlaceStates();

  const reload = useCallback(
    (placeId: string) => {
      const found = getPlace(placeId);
      if (!found) {
        toast.show({ message: t('editor.notFound'), type: 'error' });
        router.back();
        return;
      }
      setPlace(found);
      setRooms(listRooms(placeId));
      setName(found.name);
      setRadius(String(found.radius));
      setActiveRadius(String(found.activeRadius));
      setEnabled(found.enabled);
    },
    [router, t, toast],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (isNew) {
        // A new place is anchored where the user is standing — it is the only
        // position we can be sure they meant.
        const fix = await getCurrentFix();
        if (cancelled) return;
        setPlace(
          fix
            ? {
                id: `local-${Date.now()}`,
                name: '',
                latitude: fix.latitude,
                longitude: fix.longitude,
                radius: 60,
                activeRadius: 100,
                polygon: null,
                enabled: true,
                createdAt: Date.now(),
              }
            : null,
        );
        setLoading(false);
        return;
      }

      if (typeof id === 'string') reload(id);
      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, reload]);

  const parsedRadius = Number(radius.replace(',', '.'));
  const parsedActiveRadius = Number(activeRadius.replace(',', '.'));

  /**
   * The one rule the data model cannot express: `activeRadius` must be at least
   * `radius`, otherwise the exit threshold sits inside the entry threshold and
   * the hysteresis band inverts into a permanent flip-flop.
   */
  const validationError = useMemo(() => {
    if (!name.trim()) return t('editor.errors.name');
    if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) return t('editor.errors.radius');
    if (!Number.isFinite(parsedActiveRadius) || parsedActiveRadius <= 0) {
      return t('editor.errors.activeRadius');
    }
    if (parsedActiveRadius < parsedRadius) return t('editor.errors.ordering');
    return null;
  }, [name, parsedRadius, parsedActiveRadius, t]);

  const save = useCallback(() => {
    if (!place || validationError) {
      if (validationError) toast.show({ message: validationError, type: 'error' });
      return;
    }

    upsertPlace({
      ...place,
      name: name.trim(),
      radius: parsedRadius,
      activeRadius: parsedActiveRadius,
      enabled,
    });

    invalidateGeofencingData();
    void refreshMonitoring();
    toast.show({ message: t('editor.saved'), type: 'success' });
    router.back();
  }, [
    place,
    validationError,
    name,
    parsedRadius,
    parsedActiveRadius,
    enabled,
    router,
    t,
    toast,
  ]);

  const remove = useCallback(() => {
    if (!place || isNew) return;

    Alert.alert(t('editor.deleteTitle'), t('editor.deleteBody', { name: place.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deletePlace(place.id);
          invalidateGeofencingData();
          void refreshMonitoring();
          router.back();
        },
      },
    ]);
  }, [place, isNew, router, t]);

  const finishDrawing = useCallback(() => {
    if (!place || draft.length < MIN_ROOM_VERTICES) return;

    upsertRoom({
      id: `${place.id}-room-${Date.now()}`,
      placeId: place.id,
      name: t('editor.roomDefaultName', { index: rooms.length + 1 }),
      polygon: draft,
      createdAt: Date.now(),
    });

    setRooms(listRooms(place.id));
    setDraft([]);
    setDrawing(false);
    invalidateGeofencingData();
    toast.show({ message: t('editor.roomSaved'), type: 'success' });
  }, [place, draft, rooms.length, t, toast]);

  const removeRoom = useCallback(
    (room: Room) => {
      deleteRoom(room.id);
      if (place) setRooms(listRooms(place.id));
      invalidateGeofencingData();
    },
    [place],
  );

  return {
    isNew,
    loading,
    name,
    setName,
    radius,
    setRadius,
    activeRadius,
    setActiveRadius,
    enabled,
    toggleEnabled: () => setEnabled((value) => !value),
    place,
    rooms,
    states,
    mapAvailable: isMapAvailable,
    draft,
    drawing,
    canFinishDraft: draft.length >= MIN_ROOM_VERTICES,
    draftPerimeter: draft.length >= 2 ? ringPerimeterMeters(draft) : 0,
    validationError,
    startDrawing: () => {
      setDraft([]);
      setDrawing(true);
    },
    cancelDrawing: () => {
      setDraft([]);
      setDrawing(false);
    },
    addVertex: (point) => setDraft((current) => [...current, point]),
    undoVertex: () => setDraft((current) => current.slice(0, -1)),
    finishDrawing,
    removeRoom,
    save,
    remove,
    goBack: () => router.back(),
  };
}
