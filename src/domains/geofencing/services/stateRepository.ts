import { getDatabase } from '@src/core/db';

import type { PresenceState, TargetState } from '@src/domains/geofencing/types';

interface StateRow {
  target_id: string;
  target_kind: TargetState['targetKind'];
  company_id: string;
  state: PresenceState;
  transition_seq: number;
  since: number;
  last_distance: number | null;
  pending_state: PresenceState | null;
  pending_count: number;
  updated_at: number;
}

const toState = (row: StateRow): TargetState => ({
  targetId: row.target_id,
  targetKind: row.target_kind,
  companyId: row.company_id,
  state: row.state,
  transitionSeq: row.transition_seq,
  since: row.since,
  lastDistance: row.last_distance,
  pendingState: row.pending_state,
  pendingCount: row.pending_count,
  updatedAt: row.updated_at,
});

export function loadStatesFor(targetIds: readonly string[]): Map<string, TargetState> {
  if (targetIds.length === 0) return new Map();

  const rows = getDatabase().getAllSync<StateRow>(
    `SELECT * FROM monitor_state WHERE target_id IN (${targetIds.map(() => '?').join(',')});`,
    targetIds as string[],
  );
  return new Map(rows.map((row) => [row.target_id, toState(row)]));
}

export function loadOccupiedCompanyIds(): string[] {
  return getDatabase()
    .getAllSync<{ company_id: string }>(
      `SELECT DISTINCT s.company_id
         FROM monitor_state s
         JOIN companies c ON c.id = s.company_id
        WHERE s.state = 'inside' AND s.target_kind = 'company' AND c.enabled = 1;`,
    )
    .map((row) => row.company_id);
}

export function saveStates(
  states: readonly TargetState[],
  db = getDatabase(),
): void {
  for (const state of states) {
    db.runSync(
      `INSERT INTO monitor_state
         (target_id, target_kind, company_id, state, transition_seq, since,
          last_distance, pending_state, pending_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_id) DO UPDATE SET
         target_kind = excluded.target_kind,
         company_id = excluded.company_id,
         state = excluded.state,
         transition_seq = excluded.transition_seq,
         since = excluded.since,
         last_distance = excluded.last_distance,
         pending_state = excluded.pending_state,
         pending_count = excluded.pending_count,
         updated_at = excluded.updated_at;`,
      [
        state.targetId,
        state.targetKind,
        state.companyId,
        state.state,
        state.transitionSeq,
        state.since,
        state.lastDistance,
        state.pendingState,
        state.pendingCount,
        state.updatedAt,
      ],
    );
  }
}

export function listStatesForUi(): TargetState[] {
  return getDatabase()
    .getAllSync<StateRow>('SELECT * FROM monitor_state ORDER BY updated_at DESC;')
    .map(toState);
}
