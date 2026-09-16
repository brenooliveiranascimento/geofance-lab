/**
 * Schema migrations, applied in order and tracked with `PRAGMA user_version`.
 *
 * Append-only: never edit a shipped migration, add another one. The array index
 * plus one is the version a migration takes the database to.
 */
export const MIGRATIONS: readonly string[] = [
  // ---- v1: places, rooms, state machine, events, messaging, log -------------
  `
  CREATE TABLE IF NOT EXISTS places (
    id            TEXT    PRIMARY KEY NOT NULL,
    name          TEXT    NOT NULL,
    latitude      REAL    NOT NULL,
    longitude     REAL    NOT NULL,
    radius        REAL    NOT NULL,
    active_radius REAL    NOT NULL,
    -- JSON array of {latitude, longitude}; null for a plain circular place.
    polygon       TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id         TEXT    PRIMARY KEY NOT NULL,
    place_id   TEXT    NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    polygon    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rooms_place ON rooms(place_id);

  -- One row per monitored target. \`transition_seq\` is the monotonic counter
  -- that makes every emitted event uniquely identifiable, so a process restart
  -- cannot replay one.
  CREATE TABLE IF NOT EXISTS monitor_state (
    target_id      TEXT    PRIMARY KEY NOT NULL,
    target_kind    TEXT    NOT NULL,
    place_id       TEXT    NOT NULL,
    state          TEXT    NOT NULL,
    transition_seq INTEGER NOT NULL DEFAULT 0,
    since          INTEGER NOT NULL,
    last_distance  REAL,
    -- Debounce bookkeeping: a candidate flip only commits after N consecutive
    -- fixes agree, which is what keeps GPS jitter from producing event storms.
    pending_state  TEXT,
    pending_count  INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_monitor_state_place ON monitor_state(place_id);

  CREATE TABLE IF NOT EXISTS geofence_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT    NOT NULL UNIQUE,
    kind            TEXT    NOT NULL,
    place_id        TEXT    NOT NULL,
    place_name      TEXT    NOT NULL,
    room_id         TEXT,
    room_name       TEXT,
    occurred_at     INTEGER NOT NULL,
    latitude        REAL,
    longitude       REAL,
    accuracy        REAL,
    distance        REAL,
    source          TEXT    NOT NULL,
    notified        INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_events_occurred ON geofence_events(occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_events_place ON geofence_events(place_id, occurred_at DESC);

  CREATE TABLE IF NOT EXISTS message_schedule (
    sequence        TEXT    NOT NULL,
    position        INTEGER NOT NULL,
    message_id      TEXT    NOT NULL,
    scheduled_for   INTEGER NOT NULL,
    notification_id TEXT,
    state           TEXT    NOT NULL,
    delivered_at    INTEGER,
    last_error      TEXT,
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (sequence, position)
  );
  CREATE INDEX IF NOT EXISTS idx_schedule_due ON message_schedule(state, scheduled_for);

  CREATE TABLE IF NOT EXISTS delivery_receipts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT    NOT NULL UNIQUE,
    sequence        TEXT    NOT NULL,
    position        INTEGER NOT NULL,
    payload         TEXT    NOT NULL,
    state           TEXT    NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    last_error      TEXT,
    created_at      INTEGER NOT NULL,
    confirmed_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_receipts_pending ON delivery_receipts(state, next_attempt_at);

  CREATE TABLE IF NOT EXISTS app_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT    NOT NULL,
    tag        TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    data       TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_log_created ON app_log(created_at DESC);

  -- Small scalars the background tasks need without loading a whole domain:
  -- monitor origin, enrollment timestamp, active region set.
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];
