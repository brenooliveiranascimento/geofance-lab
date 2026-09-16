import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { readSeededAt } from '@src/core/bootstrap';
import { clearLog, readLog, type LogEntry } from '@src/core/logger';
import {
  GEOFENCING_TASK,
  LOCATION_TASK,
  MONITOR_CONFIG,
} from '@src/domains/geofencing/config';
import { useMonitorSnapshot } from '@src/domains/geofencing/queries/useMonitorSnapshot';
import { countEvents } from '@src/domains/geofencing/services/eventRepository';
import { countPlaces } from '@src/domains/geofencing/services/placeRepository';
import { MESSAGING_TASK } from '@src/domains/messaging/config';
import { useToast } from '@src/lib/toast';

export interface TaskStatus {
  name: string;
  registered: boolean;
}

export interface DiagnosticsViewModel {
  log: LogEntry[];
  tasks: TaskStatus[];
  maxNativeRegions: number;
  registeredRegions: number;
  activePlaces: number;
  totalPlaces: number;
  totalEvents: number;
  seededAt: number | null;
  running: boolean;
  refresh: () => void;
  copyLog: () => Promise<void>;
  clear: () => void;
  goBack: () => void;
}

/**
 * The window into what happened while nobody was watching.
 *
 * Background tasks run in a process with no console anyone can read, so the log
 * is written to SQLite and shown here. This screen is also how the platform
 * behaviour described in the README was actually observed rather than guessed.
 */
export function useDiagnosticsViewModel(): DiagnosticsViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  const { data: snapshot } = useMonitorSnapshot();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [counts, setCounts] = useState({ places: 0, events: 0 });

  const refresh = useCallback(() => {
    setLog(readLog(200));
    setCounts({ places: countPlaces(), events: countEvents() });

    void (async () => {
      const entries = await Promise.all(
        [GEOFENCING_TASK, LOCATION_TASK, MESSAGING_TASK].map(async (name) => ({
          name,
          registered: await TaskManager.isTaskRegisteredAsync(name).catch(() => false),
        })),
      );

      // `hasStartedGeofencingAsync` is the platform's own answer, which can
      // disagree with our persisted flag if the OS dropped the registration.
      const geofencingLive = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK).catch(
        () => false,
      );

      setTasks(
        entries.map((entry) =>
          entry.name === GEOFENCING_TASK
            ? { ...entry, registered: entry.registered && geofencingLive }
            : entry,
        ),
      );
    })();
  }, []);

  useEffect(refresh, [refresh]);

  const copyLog = useCallback(async () => {
    const payload = log
      .map((entry) => {
        const when = new Date(entry.createdAt).toISOString();
        return `${when} [${entry.level}] ${entry.tag}: ${entry.message}${entry.data ? ` ${entry.data}` : ''}`;
      })
      .join('\n');

    if (!payload) {
      toast.show({ message: t('diagnostics.empty') });
      return;
    }
    await Clipboard.setStringAsync(payload);
    toast.show({ message: t('diagnostics.copied') });
  }, [log, t, toast]);

  return {
    log,
    tasks,
    maxNativeRegions: MONITOR_CONFIG.maxNativeRegions,
    registeredRegions: snapshot?.regionCount ?? 0,
    activePlaces: snapshot?.activePlaceIds.length ?? 0,
    totalPlaces: counts.places,
    totalEvents: counts.events,
    seededAt: readSeededAt(),
    running: snapshot?.running ?? false,
    refresh,
    copyLog,
    clear: () => {
      clearLog();
      refresh();
    },
    goBack: () => router.back(),
  };
}
