/** The two sequences from the brief. */
export type SequenceId = 'onboarding' | 'daily';

/** Authored content. Timing lives entirely in the planner. */
export interface MessageDefinition {
  id: string;
  title: string;
  body: string;
}

/** One message with its resolved delivery time and display metadata. */
export interface PlannedMessage {
  sequence: SequenceId;
  /** Zero-based position within the sequence. Ordering is by construction. */
  position: number;
  messageId: string;
  title: string;
  body: string;
  /** "Semana 1 · Mensagem 3 de 7" — iOS subtitle, body prefix on Android. */
  subtitle: string;
  scheduledFor: number;
}

export type ScheduleState = 'scheduled' | 'delivered' | 'cancelled' | 'failed';

/** A planned message as persisted, plus whatever the OS gave us back. */
export interface ScheduledMessage {
  sequence: SequenceId;
  position: number;
  messageId: string;
  scheduledFor: number;
  notificationId: string | null;
  state: ScheduleState;
  deliveredAt: number | null;
  lastError: string | null;
  updatedAt: number;
}

export type ReceiptState = 'pending' | 'confirmed' | 'exhausted';

export interface DeliveryReceipt {
  id?: number;
  idempotencyKey: string;
  sequence: SequenceId;
  position: number;
  payload: string;
  state: ReceiptState;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  confirmedAt: number | null;
}

export interface MessagingSnapshot {
  enrolledAt: number | null;
  scheduled: number;
  delivered: number;
  total: number;
  pendingReceipts: number;
  nextMessage: ScheduledMessage | null;
}
