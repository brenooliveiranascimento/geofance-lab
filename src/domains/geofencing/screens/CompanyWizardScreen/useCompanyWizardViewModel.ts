import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  circumscribedRadiusMeters,
  isRingInsideRing,
  isSimpleRing,
  nearestVertexDistanceMeters,
  ringAreaSquareMeters,
  ringCentroid,
  untangleRing,
  type LatLng,
  type Ring,
} from '@src/core/geo';
import { logger } from '@src/core/logger';
import { useToast } from '@src/lib/toast';
import { useStore } from '@src/store';

import { COMPANY_SHAPE } from '../../config';
import { isMapAvailable } from '../../mapAvailability';
import { invalidateGeofencingData } from '../../queries/invalidate';
import { upsertCompany, upsertRoom } from '../../services/companyRepository';
import {
  getApproximateFix,
  readSnapshot,
  refreshMonitoring,
  startMonitoring,
} from '../../services/monitorService';
import type { Company } from '../../types';

export type WizardStep = 'name' | 'outline' | 'rooms' | 'roomDraw' | 'roomName';

export interface DraftRoom {
  id: string;
  name: string;
  polygon: Ring;
}

export interface CompanyWizardViewModel {
  step: WizardStep;
  stepIndex: number;
  stepCount: number;
  mapAvailable: boolean;
  loading: boolean;
  saving: boolean;
  origin: LatLng | null;

  name: string;
  setName: (value: string) => void;

  outline: Ring;
  rooms: DraftRoom[];
  draft: Ring;
  roomName: string;
  setRoomName: (value: string) => void;

  error: string | null;
  canAdvance: boolean;
  tangled: boolean;
  draftAreaSquareMeters: number;
  drawingCenter: LatLng | null;
  drawingSpanMeters: number;

  onCenterMove: (center: LatLng) => void;
  addPoint: () => void;
  undoPoint: () => void;
  clearDraft: () => void;
  untangle: () => void;

  advance: () => void;
  back: () => void;
  startRoom: () => void;
  removeRoom: (id: string) => void;
  finish: () => Promise<void>;
  cancel: () => void;
  recenter: () => Promise<LatLng | null>;
}

const STEP_ORDER: WizardStep[] = ['name', 'outline', 'rooms'];

export function useCompanyWizardViewModel(): CompanyWizardViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  const onboardingCompleted = useStore((s) => s.onboardingCompleted);
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);

  const [step, setStep] = useState<WizardStep>('name');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState<LatLng | null>(null);

  const [name, setName] = useState('');
  const [outline, setOutline] = useState<Ring>([]);
  const [rooms, setRooms] = useState<DraftRoom[]>([]);
  const [draft, setDraft] = useState<Ring>([]);
  const [roomName, setRoomName] = useState('');

  const centerRef = useRef<LatLng | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const fix = (await getApproximateFix()) ?? readSnapshot().lastFix;
      if (cancelled) return;
      if (fix) {
        const point = { latitude: fix.latitude, longitude: fix.longitude };
        setOrigin(point);
        centerRef.current = point;
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onCenterMove = useCallback((center: LatLng) => {
    centerRef.current = center;
  }, []);

  const isDrawing = step === 'outline' || step === 'roomDraw';
  const currentRing = step === 'outline' ? outline : draft;

  const addPoint = useCallback(() => {
    const center = centerRef.current;
    if (!center) return;

    const existing = step === 'outline' ? outline : draft;
    if (nearestVertexDistanceMeters(center, existing) < COMPANY_SHAPE.minVertexSpacingMeters) {
      toast.show({ message: t('wizard.errors.tooClose') });
      return;
    }

    if (step === 'outline') setOutline((ring) => [...ring, center]);
    else setDraft((ring) => [...ring, center]);
  }, [step, outline, draft, t, toast]);

  const undoPoint = useCallback(() => {
    if (step === 'outline') setOutline((ring) => ring.slice(0, -1));
    else setDraft((ring) => ring.slice(0, -1));
  }, [step]);

  const clearDraft = useCallback(() => {
    if (step === 'outline') setOutline([]);
    else setDraft([]);
  }, [step]);

  const draftAreaSquareMeters = useMemo(
    () => (currentRing.length >= 3 ? ringAreaSquareMeters(currentRing) : 0),
    [currentRing],
  );

  const tangled = useMemo(
    () => isDrawing && currentRing.length >= 4 && !isSimpleRing(currentRing),
    [isDrawing, currentRing],
  );

  const outlineCentroid = useMemo(() => ringCentroid(outline), [outline]);

  const drawingCenter = step === 'roomDraw' ? (outlineCentroid ?? origin) : origin;

  const drawingSpanMeters = useMemo(() => {
    if (step !== 'roomDraw' || !outlineCentroid) return step === 'roomDraw' ? 70 : 160;
    return Math.max(circumscribedRadiusMeters(outline, outlineCentroid) * 3, 40);
  }, [step, outline, outlineCentroid]);

  const error = useMemo(() => {
    if (step === 'name' && name.trim().length < 2) return t('wizard.errors.name');

    if (isDrawing) {
      if (currentRing.length < COMPANY_SHAPE.minVertices) {
        return t('wizard.errors.vertices', { total: COMPANY_SHAPE.minVertices });
      }
      if (tangled) return t('wizard.errors.selfIntersecting');
      const minArea =
        step === 'outline'
          ? COMPANY_SHAPE.minCompanyAreaSquareMeters
          : COMPANY_SHAPE.minRoomAreaSquareMeters;
      if (draftAreaSquareMeters < minArea) return t('wizard.errors.area', { total: minArea });

      if (step === 'roomDraw' && !isRingInsideRing(currentRing, outline)) {
        return t('wizard.errors.outsideCompany');
      }
    }

    if (step === 'roomName' && roomName.trim().length < 2) return t('wizard.errors.roomName');

    return null;
  }, [step, name, isDrawing, currentRing, tangled, draftAreaSquareMeters, outline, roomName, t]);

  const advance = useCallback(() => {
    if (error) return;

    if (step === 'name') setStep('outline');
    else if (step === 'outline') setStep('rooms');
    else if (step === 'roomDraw') {
      setRoomName(t('wizard.roomDefaultName', { index: rooms.length + 1 }));
      setStep('roomName');
    } else if (step === 'roomName') {
      setRooms((current) => [
        ...current,
        { id: `room-${Date.now()}`, name: roomName.trim(), polygon: draft },
      ]);
      setDraft([]);
      setRoomName('');
      setStep('rooms');
    }
  }, [error, step, rooms.length, roomName, draft, t]);

  const back = useCallback(() => {
    if (step === 'outline') setStep('name');
    else if (step === 'rooms') setStep('outline');
    else if (step === 'roomDraw') {
      setDraft([]);
      setStep('rooms');
    } else if (step === 'roomName') setStep('roomDraw');
  }, [step]);

  const finish = useCallback(async () => {
    const centroid = ringCentroid(outline);
    if (!centroid || outline.length < COMPANY_SHAPE.minVertices) return;

    setSaving(true);
    try {
      const createdAt = Date.now();
      const companyId = `company-${createdAt}`;

      const radius = circumscribedRadiusMeters(outline, centroid);

      const company: Company = {
        id: companyId,
        name: name.trim(),
        latitude: centroid.latitude,
        longitude: centroid.longitude,
        radius,
        activeRadius: radius + COMPANY_SHAPE.exitBufferMeters,
        polygon: outline,
        enabled: true,
        createdAt,
      };

      upsertCompany(company);
      for (const room of rooms) {
        upsertRoom({
          id: `${companyId}-${room.id}`,
          companyId,
          name: room.name,
          polygon: room.polygon,
          createdAt,
        });
      }

      invalidateGeofencingData();
      toast.show({ message: t('wizard.saved', { name: company.name }), type: 'success' });

      try {
        if (readSnapshot().running) {
          await refreshMonitoring();
        } else {
          const result = await startMonitoring();
          if (!result.started) {
            toast.show({
              message: t(`monitor.startFailed.${result.reason ?? 'permissions'}`),
              type: 'warning',
            });
          }
        }
      } catch (error) {
        logger.error('wizard', 'company saved but monitoring failed to start', {
          error: String(error),
        });
        toast.show({ message: t('wizard.savedButNotMonitoring'), type: 'warning' });
      }

      if (!onboardingCompleted) {
        setOnboardingCompleted(true);
        router.replace('/(tabs)');
      } else {
        router.back();
      }
    } finally {
      setSaving(false);
    }
  }, [outline, name, rooms, onboardingCompleted, setOnboardingCompleted, router, t, toast]);

  const cancel = useCallback(() => {
    if (!onboardingCompleted) {
      setOnboardingCompleted(true);
      router.replace('/(tabs)');
    } else {
      router.back();
    }
  }, [onboardingCompleted, setOnboardingCompleted, router]);

  return {
    step,
    stepIndex: Math.max(STEP_ORDER.indexOf(step === 'roomDraw' || step === 'roomName' ? 'rooms' : step), 0),
    stepCount: STEP_ORDER.length,
    mapAvailable: isMapAvailable,
    loading,
    saving,
    origin,
    name,
    setName,
    outline,
    rooms,
    draft,
    roomName,
    setRoomName,
    error,
    canAdvance: error === null,
    tangled,
    draftAreaSquareMeters,
    drawingCenter,
    drawingSpanMeters,
    onCenterMove,
    addPoint,
    undoPoint,
    clearDraft,
    untangle: () => {
      if (step === 'outline') setOutline((ring) => untangleRing(ring));
      else setDraft((ring) => untangleRing(ring));
    },
    advance,
    back,
    startRoom: () => {
      setDraft([]);
      if (outlineCentroid) centerRef.current = outlineCentroid;
      setStep('roomDraw');
    },
    removeRoom: (id) => setRooms((current) => current.filter((room) => room.id !== id)),
    finish,
    cancel,
    recenter: async () => {
      const fix = await getApproximateFix();
      if (!fix) return null;
      const point = { latitude: fix.latitude, longitude: fix.longitude };
      centerRef.current = point;
      return point;
    },
  };
}
