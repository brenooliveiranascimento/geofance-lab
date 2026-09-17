import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { clearLog, readLog, type LogEntry } from '@src/core/logger';
import {
  GEOFENCING_TASK,
  LOCATION_TASK,
  MONITOR_CONFIG,
} from '@src/domains/geofencing/config';
import { useMonitorSnapshot } from '@src/domains/geofencing/queries/useMonitorSnapshot';
import { countEvents } from '@src/domains/geofencing/services/eventRepository';
import { countCompanies } from '@src/domains/geofencing/services/companyRepository';
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
  activeCompanies: number;
  totalCompanies: number;
  totalEvents: number;
  running: boolean;
  refresh: () => void;
  copyLog: () => Promise<void>;
  clear: () => void;
  goBack: () => void;
}

export function useDiagnosticsViewModel(): DiagnosticsViewModel {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();

  const { data: snapshot } = useMonitorSnapshot();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [counts, setCounts] = useState({ companies: 0, events: 0 });

  const refresh = useCallback(() => {
    setLog(readLog(200));
    setCounts({ companies: countCompanies(), events: countEvents() });

    void (async () => {
      const entries = await Promise.all(
        [GEOFENCING_TASK, LOCATION_TASK, MESSAGING_TASK].map(async (name) => ({
          name,
          registered: await TaskManager.isTaskRegisteredAsync(name).catch(() => false),
        })),
      );

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
    activeCompanies: snapshot?.activeCompanyIds.length ?? 0,
    totalCompanies: counts.companies,
    totalEvents: counts.events,
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
