import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@src/lib/toast';

import { invalidateGeofencingData } from '../../queries/invalidate';
import { useEvents } from '../../queries/useEvents';
import { clearEvents, exportEventsAsJsonl } from '../../services/eventRepository';
import type { GeofenceEvent, GeofenceEventKind } from '../../types';

export type EventScope = 'all' | 'places' | 'rooms';

const SCOPE_KINDS: Record<EventScope, GeofenceEventKind[] | undefined> = {
  all: undefined,
  places: ['place_enter', 'place_exit'],
  rooms: ['room_enter', 'room_exit'],
};

export interface EventLogViewModel {
  events: GeofenceEvent[];
  scope: EventScope;
  setScope: (scope: EventScope) => void;
  counts: { total: number; entries: number; exits: number };
  clear: () => void;
  copyToClipboard: () => Promise<void>;
}

export function useEventLogViewModel(): EventLogViewModel {
  const { t } = useTranslation();
  const toast = useToast();
  const [scope, setScope] = useState<EventScope>('all');

  const { data: events = [] } = useEvents({ kinds: SCOPE_KINDS[scope], limit: 300 });

  const counts = useMemo(
    () => ({
      total: events.length,
      entries: events.filter((e) => e.kind.endsWith('_enter')).length,
      exits: events.filter((e) => e.kind.endsWith('_exit')).length,
    }),
    [events],
  );

  const clear = useCallback(() => {
    clearEvents();
    invalidateGeofencingData();
    toast.show({ message: t('events.cleared') });
  }, [t, toast]);

  /**
   * Newline-delimited JSON on the clipboard.
   *
   * Deliberately not a file share: the point is to get the log off the device
   * during a field test, and pasting into a note works on any phone without a
   * share sheet, a provider or a storage permission.
   */
  const copyToClipboard = useCallback(async () => {
    const payload = exportEventsAsJsonl();
    if (!payload) {
      toast.show({ message: t('events.nothingToExport') });
      return;
    }
    await Clipboard.setStringAsync(payload);
    toast.show({ message: t('events.copied') });
  }, [t, toast]);

  return { events, scope, setScope, counts, clear, copyToClipboard };
}
