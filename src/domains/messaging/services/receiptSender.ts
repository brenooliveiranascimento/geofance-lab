import { getDatabase } from '@src/core/db';
import { logger } from '@src/core/logger';

import { slotKey } from './sequencePlanner';
import { DELIVERY_ENDPOINT, MESSAGING_CONFIG } from '../config';
import type { DeliveryReceipt, ReceiptState, SequenceId } from '../types';

const TAG = 'receipts';

export interface BackoffConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Delay before attempt number `attempts + 1`.
 *
 * Doubles each time and saturates at the ceiling, so a server that is down for
 * hours is retried a handful of times rather than hammered, while a transient
 * failure recovers in seconds. Returns null once the attempts are spent, which
 * is what moves the receipt to `exhausted` instead of retrying forever.
 */
export function computeBackoffMs(attempts: number, config: BackoffConfig): number | null {
  if (attempts >= config.maxAttempts) return null;
  const delay = config.baseDelayMs * 2 ** attempts;
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

/**
 * Queues a delivery confirmation.
 *
 * The queue is the state, not the request: the confirmation is durable the
 * instant the message is delivered, and sending it is a separate concern that
 * may fail and retry for hours. Working offline therefore needs no special case
 * — it is simply a send that has not succeeded yet.
 *
 * `idempotency_key` is UNIQUE, so a message observed twice enqueues once.
 */
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

async function post(receipt: DeliveryReceipt): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MESSAGING_CONFIG.receipts.requestTimeoutMs,
  );

  try {
    const response = await fetch(DELIVERY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Lets the receiving end deduplicate too, since a response we never
        // saw is indistinguishable from one that never happened.
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
}

/**
 * Sends whatever confirmations are due.
 *
 * Called on foreground, when connectivity returns, and from the periodic
 * background task — three independent triggers, because none of them is
 * guaranteed to happen and the queue must drain eventually regardless.
 */
export async function drainReceipts(limit = 20): Promise<DrainResult> {
  const result: DrainResult = { attempted: 0, confirmed: 0, retried: 0, exhausted: 0 };

  if (!DELIVERY_ENDPOINT) return result;

  const db = getDatabase();
  const pending = dueReceipts(Date.now(), limit);

  for (const receipt of pending) {
    result.attempted += 1;
    try {
      await post(receipt);
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

/** Puts exhausted receipts back in the queue. Wired to a button in the UI. */
export function retryExhaustedReceipts(): number {
  const result = getDatabase().runSync(
    `UPDATE delivery_receipts
        SET state = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL
      WHERE state = 'exhausted';`,
    Date.now(),
  );
  return result.changes;
}

export const receiptKeyFor = (sequence: SequenceId, position: number): string =>
  slotKey(sequence, position);
