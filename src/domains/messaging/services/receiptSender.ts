import * as Network from 'expo-network';

import { getDatabase, readJson, writeJson } from '@src/core/db';
import { logger } from '@src/core/logger';

import { slotKey } from './sequencePlanner';
import { DELIVERY_ENDPOINT_DEFAULT, MESSAGING_CONFIG, MESSAGING_KEYS } from '../config';
import type { DeliveryReceipt, ReceiptState, SequenceId } from '../types';

const TAG = 'receipts';

export interface BackoffConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface ParsedEndpoint {
  valid: boolean;
  value: string;
}

export function parseEndpoint(raw: string): ParsedEndpoint {
  const trimmed = raw.trim();
  if (trimmed === '') return { valid: true, value: '' };
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) return { valid: false, value: trimmed };
  return { valid: true, value: trimmed.replace(/\/+$/, '') };
}

export function readDeliveryEndpoint(): string {
  return readJson<string>(MESSAGING_KEYS.deliveryEndpoint) || DELIVERY_ENDPOINT_DEFAULT;
}

export function writeDeliveryEndpoint(endpoint: string): void {
  writeJson(MESSAGING_KEYS.deliveryEndpoint, endpoint);
}

export interface ProbeResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function probeDeliveryEndpoint(endpoint: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MESSAGING_CONFIG.receipts.requestTimeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'probe' },
      body: JSON.stringify({ probe: true, at: Date.now() }),
      signal: controller.signal,
    });
    if (!response.ok) logger.warn(TAG, 'probe rejected', { status: response.status });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    logger.warn(TAG, 'probe failed', { error: String(error) });
    return { ok: false, error: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export function computeBackoffMs(attemptsMade: number, config: BackoffConfig): number | null {
  if (attemptsMade >= config.maxAttempts) return null;
  const delay = config.baseDelayMs * 2 ** (attemptsMade - 1);
  return Math.min(delay, config.maxDelayMs);
}

interface ReceiptRow {
  id: number;
  idempotency_key: string;
  sequence: SequenceId;
  position: number;
  payload: string;
  state: ReceiptState;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
  confirmed_at: number | null;
}

const toReceipt = (row: ReceiptRow): DeliveryReceipt => ({
  id: row.id,
  idempotencyKey: row.idempotency_key,
  sequence: row.sequence,
  position: row.position,
  payload: row.payload,
  state: row.state,
  attempts: row.attempts,
  nextAttemptAt: row.next_attempt_at,
  lastError: row.last_error,
  createdAt: row.created_at,
  confirmedAt: row.confirmed_at,
});

export interface ReceiptPayload {
  idempotencyKey: string;
  sequence: SequenceId;
  position: number;
  messageId: string;
  subtitle: string;
  deliveredAt: number;
}

export function enqueueReceipt(payload: ReceiptPayload, db = getDatabase()): void {
  const now = Date.now();
  db.runSync(
    `INSERT OR IGNORE INTO delivery_receipts
       (idempotency_key, sequence, position, payload, state, attempts, next_attempt_at, last_error, created_at, confirmed_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, ?, NULL);`,
    [payload.idempotencyKey, payload.sequence, payload.position, JSON.stringify(payload), now, now],
  );
}

export function listReceipts(limit = 200): DeliveryReceipt[] {
  return getDatabase()
    .getAllSync<ReceiptRow>('SELECT * FROM delivery_receipts ORDER BY created_at DESC LIMIT ?;', limit)
    .map(toReceipt);
}

export function countPendingReceipts(): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM delivery_receipts WHERE state = 'pending';",
  );
  return row?.total ?? 0;
}

function dueReceipts(now: number, limit: number): DeliveryReceipt[] {
  return getDatabase()
    .getAllSync<ReceiptRow>(
      `SELECT * FROM delivery_receipts
        WHERE state = 'pending' AND next_attempt_at <= ?
        ORDER BY next_attempt_at LIMIT ?;`,
      [now, limit],
    )
    .map(toReceipt);
}

async function post(receipt: DeliveryReceipt, endpoint: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MESSAGING_CONFIG.receipts.requestTimeoutMs,
  );

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': receipt.idempotencyKey,
      },
      body: receipt.payload,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export interface DrainResult {
  attempted: number;
  confirmed: number;
  retried: number;
  exhausted: number;
  offline: boolean;
}

async function isOffline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isInternetReachable === false;
  } catch (error) {
    logger.warn(TAG, 'could not read the network state', { error: String(error) });
    return false;
  }
}

let queue: Promise<unknown> = Promise.resolve();

export function drainReceipts(limit = 20): Promise<DrainResult> {
  const run = queue.then(() => runDrain(limit));
  queue = run.catch(() => undefined);
  return run;
}

async function runDrain(limit: number): Promise<DrainResult> {
  const result: DrainResult = {
    attempted: 0,
    confirmed: 0,
    retried: 0,
    exhausted: 0,
    offline: false,
  };

  const endpoint = readDeliveryEndpoint();
  if (!endpoint) return result;

  if (await isOffline()) {
    result.offline = true;
    return result;
  }

  const db = getDatabase();
  const pending = dueReceipts(Date.now(), limit);

  for (const receipt of pending) {
    result.attempted += 1;
    try {
      await post(receipt, endpoint);
      db.runSync(
        `UPDATE delivery_receipts
            SET state = 'confirmed', confirmed_at = ?, last_error = NULL, attempts = attempts + 1
          WHERE id = ?;`,
        [Date.now(), receipt.id!],
      );
      result.confirmed += 1;
    } catch (error) {
      const attempts = receipt.attempts + 1;
      const backoff = computeBackoffMs(attempts, MESSAGING_CONFIG.receipts);
      const message = String(error);

      if (backoff === null) {
        db.runSync(
          `UPDATE delivery_receipts
              SET state = 'exhausted', attempts = ?, last_error = ?
            WHERE id = ?;`,
          [attempts, message, receipt.id!],
        );
        result.exhausted += 1;
        logger.warn(TAG, 'receipt exhausted its attempts', { key: receipt.idempotencyKey });
      } else {
        db.runSync(
          `UPDATE delivery_receipts
              SET attempts = ?, next_attempt_at = ?, last_error = ?
            WHERE id = ?;`,
          [attempts, Date.now() + backoff, message, receipt.id!],
        );
        result.retried += 1;
      }
    }
  }

  if (result.attempted > 0) logger.info(TAG, 'receipt queue drained', result);
  return result;
}

export function retryExhaustedReceipts(): number {
  const result = getDatabase().runSync(
    `UPDATE delivery_receipts
        SET state = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL
      WHERE state = 'exhausted';`,
    Date.now(),
  );
  return result.changes;
}

export const receiptKeyFor = (
  enrolledAt: number,
  sequence: SequenceId,
  position: number,
): string => `${enrolledAt}:${slotKey(sequence, position)}`;
