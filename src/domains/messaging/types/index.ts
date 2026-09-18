export type SequenceId = 'onboarding' | 'daily';

export interface MessageDefinition {
  id: string;
  title: string;
  body: string;
}

export interface PlannedMessage {
  sequence: SequenceId;
  position: number;
  messageId: string;
  title: string;
  body: string;
  subtitle: string;
  scheduledFor: number;
}

export type ScheduleState = 'scheduled' | 'delivered';

export interface ScheduledMessage {
  sequence: SequenceId;
  position: number;
  messageId: string;
  scheduledFor: number;
  notificationId: string | null;
  state: ScheduleState;
  deliveredAt: number | null;
}

export type ReceiptState = 'pending' | 'confirmed';

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
  pendingReceipts: number;
  nextMessage: ScheduledMessage | null;
}
