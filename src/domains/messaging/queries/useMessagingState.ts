import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@src/lib/query/client';

import { listReceipts } from '@src/domains/messaging/services/receiptSender';
import { readMessagingSnapshot, readPlanWithState } from '@src/domains/messaging/services/scheduler';
import type { DeliveryReceipt, MessagingSnapshot, PlannedMessage } from '@src/domains/messaging/types';

export const MESSAGING_KEY = ['messaging'] as const;

export interface PlanEntry {
  message: PlannedMessage;
  state: string;
  deliveredAt: number | null;
}

export function useMessagingSnapshot() {
  return useQuery<MessagingSnapshot>({
    queryKey: [...MESSAGING_KEY, 'snapshot'],
    queryFn: async () => readMessagingSnapshot(),
    refetchInterval: 10_000,
  });
}

export function useMessagePlan() {
  return useQuery<PlanEntry[]>({
    queryKey: [...MESSAGING_KEY, 'plan'],
    queryFn: async () => readPlanWithState(),
    refetchInterval: 10_000,
  });
}

export function useReceipts() {
  return useQuery<DeliveryReceipt[]>({
    queryKey: [...MESSAGING_KEY, 'receipts'],
    queryFn: async () => listReceipts(100),
    refetchInterval: 10_000,
  });
}

export function invalidateMessagingData(): void {
  void queryClient.invalidateQueries({ queryKey: MESSAGING_KEY });
}
