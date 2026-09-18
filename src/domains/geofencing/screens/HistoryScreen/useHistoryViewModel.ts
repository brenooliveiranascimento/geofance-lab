import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { clearLog, readLog, type LogEntry } from '@src/core/logger';
import { useToast } from '@src/lib/toast';

import { GEOFENCING_TASK, LOCATION_TASK, MONITOR_CONFIG, UPKEEP_TASK } from '@src/domains/geofencing/config';
import { invalidateGeofencingData } from '@src/domains/geofencing/queries/invalidate';
import { useEvents } from '@src/domains/geofencing/queries/useEvents';
import { useMonitorSnapshot } from '@src/domains/geofencing/queries/useMonitorSnapshot';
import { clearEvents, exportEventsAsJsonl } from '@src/domains/geofencing/services/eventRepository';
import { MESSAGING_TASK } from '@src/domains/messaging/config';
import type { GeofenceEvent, GeofenceEventKind } from '@src/domains/geofencing/types';

export type HistoryTab = 'events' | 'system';
export type EventScope = 'all' | 'companies' | 'rooms';

const SCOPE_KINDS: Record<EventScope, GeofenceEventKind[] | undefined> = {
  all: undefined,
  companies: ['company_enter', 'company_exit'],
  rooms: ['room_enter', 'room_exit'],
};

export interface HistoryViewModel {
  tab: HistoryTab;
  setTab: (tab: HistoryTab) => void;
  scope: EventScope;
  setScope: (scope: EventScope) => void;
  events: GeofenceEvent[];
  log: LogEntry[];
  tasks: { name: string; registered: boolean }[];
  regions: string;
  running: boolean;
  copy: () => Promise<void>;
  clear: () => void;
  goBack: () => void;
}

export function useHistoryViewModel(): HistoryViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<HistoryTab>('events');
  const [scope, setScope] = useState<EventScope>('all');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tasks, setTasks] = useState<{ name: string; registered: boolean }[]>([]);

  const { data: snapshot } = useMonitorSnapshot();
  const { data: events = [] } = useEvents({ kinds: SCOPE_KINDS[scope], limit: 300 });

  useEffect(() => {
    if (tab !== 'system') return;
    setLog(readLog(200));

    void (async () => {
      const live = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK).catch(() => false);
      const entries = await Promise.all(
        [GEOFENCING_TASK, LOCATION_TASK, UPKEEP_TASK, MESSAGING_TASK].map(async (name) => ({
          name: name.replace('geofence-lab.', ''),
          registered: await TaskManager.isTaskRegisteredAsync(name).catch(() => false),
        })),
      );
      setTasks(
        entries.map((entry, index) => (index === 0 ? { ...entry, registered: entry.registered && live } : entry)),
      );
    })();
  }, [tab, events.length]);

  const copy = useCallback(async () => {
    const payload =
      tab === 'events'
        ? exportEventsAsJsonl()
        : log
            .map((e) => `${new Date(e.createdAt).toISOString()} [${e.level}] ${e.tag}: ${e.message}`)
            .join('\n');

    if (!payload) {
      toast.show({ message: t('history.nothingToCopy') });
      return;
    }
    await Clipboard.setStringAsync(payload);
    toast.show({ message: t('history.copied') });
  }, [tab, log, t, toast]);

  const clear = useCallback(() => {
    if (tab === 'events') clearEvents();
    else clearLog();
    invalidateGeofencingData();
    setLog([]);
    toast.show({ message: t('history.cleared') });
  }, [tab, t, toast]);

  const regions = useMemo(
    () => `${snapshot?.regionCount ?? 0} / ${MONITOR_CONFIG.maxNativeRegions}`,
    [snapshot?.regionCount],
  );

  return {
    tab,
    setTab,
    scope,
    setScope,
    events,
    log,
    tasks,
    regions,
    running: snapshot?.running ?? false,
    copy,
    clear,
    goBack: () => router.back(),
  };
}
