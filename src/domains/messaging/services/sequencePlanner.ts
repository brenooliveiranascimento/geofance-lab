import type { MessageDefinition, PlannedMessage, ScheduledMessage, SequenceId } from '../types';

export interface PlannerConfig {
  onboarding: { offsetsMinutes: readonly number[] };
  daily: {
    hour: number;
    minute: number;
    weeks: number;
    perWeek: number;
    startsAfterOnboardingDays: number;
  };
}

export interface PlannerContent {
  onboarding: readonly MessageDefinition[];
  daily: readonly MessageDefinition[];
}

export const slotKey = (sequence: SequenceId, position: number): string =>
  `${sequence}:${position}`;

function atLocalTime(base: number, dayOffset: number, hour: number, minute: number): number {
  const date = new Date(base);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + dayOffset,
    hour,
    minute,
    0,
    0,
  ).getTime();
}

export function buildPlan(
  enrolledAt: number,
  config: PlannerConfig,
  content: PlannerContent,
): PlannedMessage[] {
  const plan: PlannedMessage[] = [];

  const onboardingCount = Math.min(config.onboarding.offsetsMinutes.length, content.onboarding.length);

  for (let position = 0; position < onboardingCount; position += 1) {
    const message = content.onboarding[position];
    plan.push({
      sequence: 'onboarding',
      position,
      messageId: message.id,
      title: message.title,
      body: message.body,
      subtitle: `Mensagem ${position + 1} de ${onboardingCount}`,
      scheduledFor: enrolledAt + config.onboarding.offsetsMinutes[position] * 60_000,
    });
  }

  const onboardingEnd = plan.length > 0 ? plan[plan.length - 1].scheduledFor : enrolledAt;

  const dailyCount = Math.min(
    config.daily.weeks * config.daily.perWeek,
    content.daily.length,
  );

  for (let position = 0; position < dailyCount; position += 1) {
    const message = content.daily[position];
    const week = Math.floor(position / config.daily.perWeek) + 1;
    const withinWeek = (position % config.daily.perWeek) + 1;

    plan.push({
      sequence: 'daily',
      position,
      messageId: message.id,
      title: message.title,
      body: message.body,
      subtitle: `Semana ${week} · Mensagem ${withinWeek} de ${config.daily.perWeek}`,
      scheduledFor: atLocalTime(
        onboardingEnd,
        config.daily.startsAfterOnboardingDays + position,
        config.daily.hour,
        config.daily.minute,
      ),
    });
  }

  return plan;
}

export function selectWindow(
  plan: readonly PlannedMessage[],
  now: number,
  horizon: number,
): PlannedMessage[] {
  return plan
    .filter((message) => message.scheduledFor > now)
    .sort((a, b) => a.scheduledFor - b.scheduledFor)
    .slice(0, Math.max(horizon, 0));
}

export interface ScheduleDiff {
  toSchedule: PlannedMessage[];
  toCancel: ScheduledMessage[];
  toMarkDelivered: ScheduledMessage[];
}

export interface DiffOptions {
  now: number;
  horizon: number;
  liveNotificationIds?: ReadonlySet<string> | null;
}

export function diffSchedule(
  plan: readonly PlannedMessage[],
  existing: readonly ScheduledMessage[],
  options: DiffOptions,
): ScheduleDiff {
  const { now, horizon, liveNotificationIds = null } = options;

  const planByKey = new Map(plan.map((message) => [slotKey(message.sequence, message.position), message]));
  const rowByKey = new Map(existing.map((row) => [slotKey(row.sequence, row.position), row]));

  const toSchedule: PlannedMessage[] = [];
  const toCancel: ScheduledMessage[] = [];
  const toMarkDelivered: ScheduledMessage[] = [];
  const needsReschedule = new Set<string>();

  for (const row of existing) {
    if (row.state !== 'scheduled') continue;

    const key = slotKey(row.sequence, row.position);
    const planned = planByKey.get(key);

    if (!planned) {
      toCancel.push(row);
      continue;
    }

    if (planned.scheduledFor !== row.scheduledFor) {
      toCancel.push(row);
      needsReschedule.add(key);
      continue;
    }

    if (row.scheduledFor <= now) {
      toMarkDelivered.push(row);
      continue;
    }

    if (liveNotificationIds && (!row.notificationId || !liveNotificationIds.has(row.notificationId))) {
      needsReschedule.add(key);
    }
  }

  for (const message of selectWindow(plan, now, horizon)) {
    const key = slotKey(message.sequence, message.position);
    const row = rowByKey.get(key);

    const missing = !row;
    const abandoned = row?.state === 'cancelled' || row?.state === 'failed';

    if (missing || abandoned || needsReschedule.has(key)) {
      toSchedule.push(message);
    }
  }

  return { toSchedule, toCancel, toMarkDelivered };
}
