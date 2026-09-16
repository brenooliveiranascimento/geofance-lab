import type { MessageDefinition, PlannedMessage, ScheduledMessage, SequenceId } from '../types';

/**
 * The planner.
 *
 * Deterministic and pure: given the enrolment instant it returns exactly which
 * messages exist, in which order, and at which absolute time. Nothing else in
 * the module decides timing, which is what makes "no duplicates" and "correct
 * order" properties of the plan rather than rules the runtime has to police.
 *
 * Reconciliation follows from that: the scheduler compares the plan against what
 * is actually queued and fixes the difference. Re-running it is a no-op, so a
 * reinstall, a restored backup, a time-zone change or a crash mid-schedule all
 * converge on the same correct state.
 */

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

/** Stable key for a slot in a sequence. Also the receipt's idempotency key. */
export const slotKey = (sequence: SequenceId, position: number): string =>
  `${sequence}:${position}`;

/**
 * A local wall-clock time, `dayOffset` days from `base`.
 *
 * Built through the Date constructor rather than by adding milliseconds so that
 * "09:00 every day" stays 09:00 across a DST boundary instead of drifting by an
 * hour. Brazil has no DST today, but the device's time zone is the user's, not
 * ours.
 */
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

/**
 * Every message of both sequences, ordered. Depends only on `enrolledAt`, so the
 * same enrolment always yields the same plan.
 */
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

  // The daily run starts the day after onboarding finishes, so the two never
  // overlap and the "starts after onboarding" requirement holds by construction.
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

/** The next `horizon` messages still in the future. */
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
  /** Messages to hand to the OS. */
  toSchedule: PlannedMessage[];
  /** Queued notifications to withdraw, because the plan no longer wants them. */
  toCancel: ScheduledMessage[];
  /** Rows whose delivery time has passed and that were still marked scheduled. */
  toMarkDelivered: ScheduledMessage[];
}

export interface DiffOptions {
  now: number;
  horizon: number;
  /**
   * Identifiers the OS reports as still queued. A row that claims to be
   * scheduled but whose notification is absent here was lost — reinstall,
   * restored backup, or the user clearing notifications — and is re-scheduled.
   * Pass null to skip the cross-check.
   */
  liveNotificationIds?: ReadonlySet<string> | null;
}

/**
 * Compares the plan with what is currently persisted and queued, and returns the
 * minimum set of operations to bring them into agreement.
 *
 * Pure, so every awkward case — resuming after a long gap, a changed plan, a
 * notification the OS dropped — is testable without a device.
 */
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

    // No longer part of the plan at all — the content or the config changed.
    if (!planned) {
      toCancel.push(row);
      continue;
    }

    // Replanned to a different instant: withdraw the old one before queueing
    // the new one, otherwise the user gets both.
    if (planned.scheduledFor !== row.scheduledFor) {
      toCancel.push(row);
      needsReschedule.add(key);
      continue;
    }

    if (row.scheduledFor <= now) {
      toMarkDelivered.push(row);
      continue;
    }

    // Still in the future, but the OS has no record of it.
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
