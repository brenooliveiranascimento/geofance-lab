import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import {
  circumscribedRadiusMeters,
  isSimpleRing,
  nearestVertexDistanceMeters,
  ringAreaSquareMeters,
  ringCentroid,
  untangleRing,
  type LatLng,
  type Ring,
} from '@src/core/geo';
import { useToast } from '@src/lib/toast';

import { COMPANY_SHAPE } from '@src/domains/geofencing/config';
import { ringIssue } from '@src/domains/geofencing/services/ringRules';
import { isMapAvailable } from '@src/domains/geofencing/mapAvailability';
import { invalidateGeofencingData } from '@src/domains/geofencing/queries/invalidate';
import { useCompanyStates } from '@src/domains/geofencing/queries/useCompanyStates';
import {
  deleteCompany,
  deleteRoom,
  getCompany,
  listRooms,
  upsertCompany,
  upsertRoom,
} from '@src/domains/geofencing/services/companyRepository';
import { getApproximateFix, refreshMonitoring } from '@src/domains/geofencing/services/monitorService';
import type { Company, Room, TargetState } from '@src/domains/geofencing/types';

export type EditorMode = 'view' | 'outlineDraw' | 'roomDraw' | 'roomName';

export interface CompanyEditorViewModel {
  mode: EditorMode;
  loading: boolean;
  company: Company | null;
  rooms: Room[];
  states: Map<string, TargetState>;
  mapAvailable: boolean;

  name: string;
  setName: (value: string) => void;
  roomName: string;
  setRoomName: (value: string) => void;

  draft: Ring;
  draftAreaSquareMeters: number;
  error: string | null;
  canCommitDraft: boolean;
  tangled: boolean;

  onCenterMove: (center: LatLng) => void;
  addPoint: () => void;
  undoPoint: () => void;
  untangle: () => void;

  startOutlineRedraw: () => void;
  startRoom: () => void;
  commitDraft: () => void;
  saveRoomName: () => void;
  cancelDraft: () => void;

  saveName: () => void;
  removeRoom: (room: Room) => void;
  removeCompany: () => void;
  recenter: () => Promise<LatLng | null>;
  goBack: () => void;
}

export function useCompanyEditorViewModel(): CompanyEditorViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [mode, setMode] = useState<EditorMode>('view');
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [draft, setDraft] = useState<Ring>([]);

  const centerRef = useRef<LatLng | null>(null);
  const { data: states = new Map<string, TargetState>() } = useCompanyStates();

  const reload = useCallback(
    (companyId: string) => {
      const found = getCompany(companyId);
      if (!found) {
        toast.show({ message: t('editor.notFound'), type: 'error' });
        router.back();
        return;
      }
      setCompany(found);
      setRooms(listRooms(companyId));
      setName(found.name);
      centerRef.current = { latitude: found.latitude, longitude: found.longitude };
    },
    [router, t, toast],
  );

  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (typeof id === 'string' && loadedId.current !== id) {
      loadedId.current = id;
      reload(id);
    }
    setLoading(false);
  }, [id, reload]);

  const onCenterMove = useCallback((center: LatLng) => {
    centerRef.current = center;
  }, []);

  const addPoint = useCallback(() => {
    const center = centerRef.current;
    if (!center) return;

    if (nearestVertexDistanceMeters(center, draft) < COMPANY_SHAPE.minVertexSpacingMeters) {
      toast.show({ message: t('wizard.errors.tooClose') });
      return;
    }
    setDraft((ring) => [...ring, center]);
  }, [draft, t, toast]);

  const draftAreaSquareMeters = useMemo(
    () => (draft.length >= 3 ? ringAreaSquareMeters(draft) : 0),
    [draft],
  );

  const drawing = mode === 'outlineDraw' || mode === 'roomDraw';

  const tangled = useMemo(
    () => drawing && draft.length >= 4 && !isSimpleRing(draft),
    [drawing, draft],
  );

  const error = useMemo(() => {
    if (mode === 'roomName') {
      return roomName.trim().length < 2 ? t('wizard.errors.roomName') : null;
    }
    if (!drawing) return null;

    const minAreaSquareMeters =
      mode === 'outlineDraw'
        ? COMPANY_SHAPE.minCompanyAreaSquareMeters
        : COMPANY_SHAPE.minRoomAreaSquareMeters;

    const issue = ringIssue(draft, {
      minAreaSquareMeters,
      containedBy: mode === 'roomDraw' ? (company?.polygon ?? null) : null,
      mustContain: mode === 'outlineDraw' ? rooms.map((room) => room.polygon) : [],
    });
    if (!issue) return null;

    return t(`wizard.errors.${issue}`, {
      total: issue === 'vertices' ? COMPANY_SHAPE.minVertices : minAreaSquareMeters,
    });
  }, [mode, drawing, roomName, draft, company, rooms, t]);

  const persistCompany = useCallback(
    (next: Company) => {
      upsertCompany(next);
      setCompany(next);
      invalidateGeofencingData();
      void refreshMonitoring();
    },
    [],
  );

  const commitDraft = useCallback(() => {
    if (error || !company) return;

    if (mode === 'outlineDraw') {
      const centroid = ringCentroid(draft)!;
      const radius = circumscribedRadiusMeters(draft, centroid);
      persistCompany({
        ...company,
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        radius,
        activeRadius: radius + COMPANY_SHAPE.exitBufferMeters,
        polygon: draft,
      });
      setDraft([]);
      setMode('view');
      toast.show({ message: t('editor.outlineSaved'), type: 'success' });
      return;
    }

    setRoomName(t('wizard.roomDefaultName', { index: rooms.length + 1 }));
    setMode('roomName');
  }, [error, company, mode, draft, rooms.length, persistCompany, t, toast]);

  const saveRoomName = useCallback(() => {
    if (error || !company) return;

    upsertRoom({
      id: `${company.id}-room-${Date.now()}`,
      companyId: company.id,
      name: roomName.trim(),
      polygon: draft,
      createdAt: Date.now(),
    });

    setRooms(listRooms(company.id));
    setDraft([]);
    setRoomName('');
    setMode('view');
    invalidateGeofencingData();
    toast.show({ message: t('editor.roomSaved'), type: 'success' });
  }, [error, company, roomName, draft, t, toast]);

  const saveName = useCallback(() => {
    if (!company || name.trim().length < 2) {
      toast.show({ message: t('wizard.errors.name'), type: 'error' });
      return;
    }
    persistCompany({ ...company, name: name.trim() });
    toast.show({ message: t('editor.saved'), type: 'success' });
  }, [company, name, persistCompany, t, toast]);

  const removeRoom = useCallback(
    (room: Room) => {
      Alert.alert(t('editor.deleteRoomTitle'), t('editor.deleteRoomBody', { name: room.name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteRoom(room.id);
            if (company) setRooms(listRooms(company.id));
            invalidateGeofencingData();
          },
        },
      ]);
    },
    [company, t],
  );

  const removeCompany = useCallback(() => {
    if (!company) return;
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteBody', { name: company.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteCompany(company.id);
          invalidateGeofencingData();
          void refreshMonitoring();
          router.back();
        },
      },
    ]);
  }, [company, router, t]);

  return {
    mode,
    loading,
    company,
    rooms,
    states,
    mapAvailable: isMapAvailable,
    name,
    setName,
    roomName,
    setRoomName,
    draft,
    draftAreaSquareMeters,
    error,
    canCommitDraft: error === null,
    tangled,
    onCenterMove,
    addPoint,
    undoPoint: () => setDraft((ring) => ring.slice(0, -1)),
    untangle: () => setDraft((ring) => untangleRing(ring)),
    startOutlineRedraw: () => {
      setDraft([]);
      setMode('outlineDraw');
    },
    startRoom: () => {
      setDraft([]);
      setMode('roomDraw');
    },
    commitDraft,
    saveRoomName,
    cancelDraft: () => {
      setDraft([]);
      setRoomName('');
      setMode('view');
    },
    saveName,
    removeRoom,
    removeCompany,
    recenter: async () => {
      const fix = await getApproximateFix();
      return fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;
    },
    goBack: () => router.back(),
  };
}
