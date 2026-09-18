import type { MessageDefinition, PlannedMessage, ScheduledMessage, SequenceId } from '@src/domains/messaging/types';

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

export interface SubtitleFormatter {
  onboarding: (position: number, total: number) => string;
  daily: (week: number, position: number, total: number) => string;
}

export interface PlannerContent {
  onboarding: readonly MessageDefinition[];
  daily: readonly MessageDefinition[];
  subtitle: SubtitleFormatter;
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
      subtitle: content.subtitle.onboarding(position + 1, onboardingCount),
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
      subtitle: content.subtitle.daily(week, withinWeek, config.daily.perWeek),
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
  const toMarkDelivered: ScheduledMessage[] = [];
  const needsReschedule = new Set<string>();

  for (const row of existing) {
    if (row.state !== 'scheduled') continue;

    const key = slotKey(row.sequence, row.position);

    if (row.scheduledFor <= now) {
      toMarkDelivered.push(row);
      continue;
    }

    const planned = planByKey.get(key);
    if (!planned) continue;

    const moved = planned.scheduledFor !== row.scheduledFor;
    const lost =
      liveNotificationIds !== null &&
      (!row.notificationId || !liveNotificationIds.has(row.notificationId));

    if (moved || lost) needsReschedule.add(key);
  }

  for (const message of selectWindow(plan, now, horizon)) {
    const key = slotKey(message.sequence, message.position);
    if (!rowByKey.has(key) || needsReschedule.has(key)) toSchedule.push(message);
  }

  return { toSchedule, toMarkDelivered };
}
