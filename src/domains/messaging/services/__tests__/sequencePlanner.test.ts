import {
  buildPlan,
  diffSchedule,
  selectWindow,
  slotKey,
  type PlannerConfig,
  type PlannerContent,
} from '../sequencePlanner';
import type { PlannedMessage, ScheduledMessage } from '../../types';

const CONFIG: PlannerConfig = {
  onboarding: { offsetsMinutes: [2, 5, 12] },
  daily: { hour: 9, minute: 0, weeks: 2, perWeek: 7, startsAfterOnboardingDays: 1 },
};

const CONTENT: PlannerContent = {
  onboarding: Array.from({ length: 3 }, (_, i) => ({
    id: `onb-${i}`,
    title: `Onboarding ${i}`,
    body: 'corpo',
  })),
  daily: Array.from({ length: 14 }, (_, i) => ({
    id: `day-${i}`,
    title: `Diária ${i}`,
    body: 'corpo',
  })),
};

/** 2026-03-10, 14:32 local. */
const ENROLLED_AT = new Date(2026, 2, 10, 14, 32, 0, 0).getTime();

const MINUTE = 60_000;
const plan = () => buildPlan(ENROLLED_AT, CONFIG, CONTENT);

const asRow = (
  message: PlannedMessage,
  overrides: Partial<ScheduledMessage> = {},
): ScheduledMessage => ({
  sequence: message.sequence,
  position: message.position,
  messageId: message.messageId,
  scheduledFor: message.scheduledFor,
  notificationId: `notif-${slotKey(message.sequence, message.position)}`,
  state: 'scheduled',
  deliveredAt: null,
  lastError: null,
  updatedAt: ENROLLED_AT,
  ...overrides,
});

describe('buildPlan — onboarding', () => {
  it('produces one message per configured offset', () => {
    const onboarding = plan().filter((m) => m.sequence === 'onboarding');
    expect(onboarding).toHaveLength(3);
    expect(onboarding.map((m) => m.messageId)).toEqual(['onb-0', 'onb-1', 'onb-2']);
  });

  it('places them minutes after enrolment, in order', () => {
    const onboarding = plan().filter((m) => m.sequence === 'onboarding');
    expect(onboarding.map((m) => m.scheduledFor - ENROLLED_AT)).toEqual([
      2 * MINUTE,
      5 * MINUTE,
      12 * MINUTE,
    ]);
  });

  it('numbers them in the subtitle', () => {
    const onboarding = plan().filter((m) => m.sequence === 'onboarding');
    expect(onboarding.map((m) => m.subtitle)).toEqual([
      'Mensagem 1 de 3',
      'Mensagem 2 de 3',
      'Mensagem 3 de 3',
    ]);
  });
});

describe('buildPlan — daily', () => {
  const daily = () => plan().filter((m) => m.sequence === 'daily');

  it('starts only after the whole onboarding sequence', () => {
    const lastOnboarding = plan().filter((m) => m.sequence === 'onboarding').at(-1)!;
    expect(daily()[0].scheduledFor).toBeGreaterThan(lastOnboarding.scheduledFor);
  });

  it('delivers exactly one message per day at the fixed hour', () => {
    for (const message of daily()) {
      const date = new Date(message.scheduledFor);
      expect(date.getHours()).toBe(9);
      expect(date.getMinutes()).toBe(0);
    }

    const days = daily().map((m) => new Date(m.scheduledFor).toDateString());
    expect(new Set(days).size).toBe(days.length);
  });

  it('advances by one calendar day each time', () => {
    const times = daily().map((m) => m.scheduledFor);
    for (let i = 1; i < times.length; i += 1) {
      const gap = times[i] - times[i - 1];
      // 24 h normally; 23 or 25 across a DST boundary, which is the point of
      // computing wall-clock time rather than adding milliseconds.
      expect(gap).toBeGreaterThanOrEqual(23 * 60 * MINUTE);
      expect(gap).toBeLessThanOrEqual(25 * 60 * MINUTE);
    }
  });

  it('labels week and position in the subtitle', () => {
    const subtitles = daily().map((m) => m.subtitle);
    expect(subtitles[0]).toBe('Semana 1 · Mensagem 1 de 7');
    expect(subtitles[6]).toBe('Semana 1 · Mensagem 7 de 7');
    expect(subtitles[7]).toBe('Semana 2 · Mensagem 1 de 7');
    expect(subtitles[13]).toBe('Semana 2 · Mensagem 7 de 7');
  });

  it('keeps the whole plan strictly ordered', () => {
    const times = plan().map((m) => m.scheduledFor);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('never reuses a slot key', () => {
    const keys = plan().map((m) => slotKey(m.sequence, m.position));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is fully deterministic for the same enrolment', () => {
    expect(buildPlan(ENROLLED_AT, CONFIG, CONTENT)).toEqual(buildPlan(ENROLLED_AT, CONFIG, CONTENT));
  });

  it('stops at whichever runs out first, config or content', () => {
    const short = buildPlan(ENROLLED_AT, CONFIG, { ...CONTENT, daily: CONTENT.daily.slice(0, 5) });
    expect(short.filter((m) => m.sequence === 'daily')).toHaveLength(5);
  });
});

describe('selectWindow', () => {
  it('returns only future messages, capped at the horizon', () => {
    const now = ENROLLED_AT + 6 * MINUTE;
    const window = selectWindow(plan(), now, 4);

    expect(window).toHaveLength(4);
    expect(window.every((m) => m.scheduledFor > now)).toBe(true);
    expect(window[0].messageId).toBe('onb-2');
  });

  it('is empty once the sequence is over', () => {
    const afterEverything = plan().at(-1)!.scheduledFor + MINUTE;
    expect(selectWindow(plan(), afterEverything, 10)).toEqual([]);
  });

  it('tolerates a non-positive horizon', () => {
    expect(selectWindow(plan(), ENROLLED_AT, 0)).toEqual([]);
  });
});

describe('diffSchedule', () => {
  const now = ENROLLED_AT + MINUTE;

  it('schedules the whole window on a fresh install', () => {
    const diff = diffSchedule(plan(), [], { now, horizon: 5 });
    expect(diff.toSchedule).toHaveLength(5);
    expect(diff.toCancel).toEqual([]);
    expect(diff.toMarkDelivered).toEqual([]);
  });

  it('is a no-op when everything already matches', () => {
    const rows = selectWindow(plan(), now, 5).map((m) => asRow(m));
    const diff = diffSchedule(plan(), rows, { now, horizon: 5 });
    expect(diff.toSchedule).toEqual([]);
    expect(diff.toCancel).toEqual([]);
  });

  it('never re-schedules a slot that is already queued', () => {
    const rows = selectWindow(plan(), now, 5).map((m) => asRow(m));
    const first = diffSchedule(plan(), rows, { now, horizon: 5 });
    const second = diffSchedule(plan(), rows, { now, horizon: 5 });
    expect(first).toEqual(second);
    expect(first.toSchedule).toHaveLength(0);
  });

  it('marks past-due rows as delivered instead of re-queueing them', () => {
    const rows = plan().slice(0, 3).map((m) => asRow(m));
    const later = ENROLLED_AT + 30 * MINUTE;

    const diff = diffSchedule(plan(), rows, { now: later, horizon: 5 });
    expect(diff.toMarkDelivered.map((r) => r.messageId)).toEqual(['onb-0', 'onb-1', 'onb-2']);
    expect(diff.toSchedule.every((m) => m.sequence === 'daily')).toBe(true);
  });

  it('tops the window up after a long gap without duplicating anything', () => {
    // App not opened for a week: three onboarding plus seven daily are past due.
    const rows = plan().slice(0, 10).map((m) => asRow(m));
    const later = plan()[9].scheduledFor + MINUTE;

    const diff = diffSchedule(plan(), rows, { now: later, horizon: 5 });
    expect(diff.toMarkDelivered).toHaveLength(10);

    const scheduledKeys = diff.toSchedule.map((m) => slotKey(m.sequence, m.position));
    const deliveredKeys = diff.toMarkDelivered.map((r) => slotKey(r.sequence, r.position));
    expect(scheduledKeys.some((key) => deliveredKeys.includes(key))).toBe(false);
  });

  it('re-schedules a slot the user abandoned', () => {
    const window = selectWindow(plan(), now, 5);
    const rows = window.map((m, i) => asRow(m, i === 0 ? { state: 'cancelled' } : {}));

    const diff = diffSchedule(plan(), rows, { now, horizon: 5 });
    expect(diff.toSchedule.map((m) => m.messageId)).toEqual([window[0].messageId]);
  });

  it('replaces a row whose planned time moved', () => {
    const window = selectWindow(plan(), now, 3);
    const rows = window.map((m, i) =>
      asRow(m, i === 1 ? { scheduledFor: m.scheduledFor + 3 * MINUTE } : {}),
    );

    const diff = diffSchedule(plan(), rows, { now, horizon: 3 });
    expect(diff.toCancel.map((r) => r.messageId)).toEqual([window[1].messageId]);
    expect(diff.toSchedule.map((m) => m.messageId)).toEqual([window[1].messageId]);
  });

  it('withdraws rows the plan no longer contains', () => {
    const orphan = asRow({ ...plan()[0], sequence: 'daily', position: 999 });
    const diff = diffSchedule(plan(), [orphan], { now, horizon: 5 });
    expect(diff.toCancel).toEqual([orphan]);
  });

  it('re-schedules when the OS lost the notification', () => {
    const window = selectWindow(plan(), now, 3);
    const rows = window.map((m) => asRow(m));
    // The OS only still knows about the first one.
    const live = new Set([rows[0].notificationId!]);

    const diff = diffSchedule(plan(), rows, { now, horizon: 3, liveNotificationIds: live });
    expect(diff.toSchedule.map((m) => m.messageId)).toEqual([
      window[1].messageId,
      window[2].messageId,
    ]);
  });

  it('leaves rows beyond the horizon alone', () => {
    const rows = plan().map((m) => asRow(m));
    const diff = diffSchedule(plan(), rows, { now, horizon: 2 });
    expect(diff.toCancel).toEqual([]);
    expect(diff.toSchedule).toEqual([]);
  });
});
