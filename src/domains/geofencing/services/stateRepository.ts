import { getDatabase } from '@src/core/db';

import type { PresenceState, TargetState } from '../types';

interface StateRow {
  target_id: string;
  target_kind: TargetState['targetKind'];
  place_id: string;
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
  placeId: row.place_id,
  state: row.state,
  transitionSeq: row.transition_seq,
  since: row.since,
  lastDistance: row.last_distance,
  pendingState: row.pending_state,
  pendingCount: row.pending_count,
  updatedAt: row.updated_at,
});

/** Every persisted state, keyed by target id. */
export function loadAllStates(): Map<string, TargetState> {
  const rows = getDatabase().getAllSync<StateRow>('SELECT * FROM monitor_state;');
  return new Map(rows.map((row) => [row.target_id, toState(row)]));
}

/** States for a subset of targets — what the fix evaluation path needs. */
export function loadStatesFor(targetIds: readonly string[]): Map<string, TargetState> {
  if (targetIds.length === 0) return new Map();

  const rows = getDatabase().getAllSync<StateRow>(
    `SELECT * FROM monitor_state WHERE target_id IN (${targetIds.map(() => '?').join(',')});`,
    targetIds as string[],
  );
  return new Map(rows.map((row) => [row.target_id, toState(row)]));
}

/** Ids of everything currently marked as occupied. */
export function loadOccupiedTargetIds(): string[] {
  return getDatabase()
    .getAllSync<{ target_id: string }>(
      "SELECT target_id FROM monitor_state WHERE state = 'inside';",
    )
    .map((row) => row.target_id);
}

export function loadOccupiedPlaceIds(): string[] {
  return getDatabase()
    .getAllSync<{ place_id: string }>(
      "SELECT DISTINCT place_id FROM monitor_state WHERE state = 'inside' AND target_kind = 'place';",
    )
    .map((row) => row.place_id);
}

/**
 * Writes state rows. Always called inside the same transaction as the matching
 * event inserts: a crash between the two would either replay an event that was
 * already delivered or swallow one that was not.
 */
export function saveStates(
  states: readonly TargetState[],
  db = getDatabase(),
): void {
  for (const state of states) {
    db.runSync(
      `INSERT INTO monitor_state
         (target_id, target_kind, place_id, state, transition_seq, since,
          last_distance, pending_state, pending_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_id) DO UPDATE SET
         target_kind = excluded.target_kind,
         place_id = excluded.place_id,
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
        state.placeId,
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

/**
 * Clears presence without touching the sequence counters.
 *
 * Used when monitoring stops: leaving stale "inside" rows behind would make the
 * next start miss a genuine entry. The counters survive so that resuming can
 * never mint an idempotency key that was already used.
 */
export function releaseAllPresence(): void {
  getDatabase().runSync(
    `UPDATE monitor_state
        SET state = 'outside', pending_state = NULL, pending_count = 0, updated_at = ?
      WHERE state = 'inside';`,
    Date.now(),
  );
}

export function listStatesForUi(): TargetState[] {
  return getDatabase()
    .getAllSync<StateRow>('SELECT * FROM monitor_state ORDER BY updated_at DESC;')
    .map(toState);
}
