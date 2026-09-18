import {
  buildPlan,
  diffSchedule,
  selectWindow,
  slotKey,
  type PlannerConfig,
  type PlannerContent,
} from '@src/domains/messaging/services/sequencePlanner';
import type { PlannedMessage, ScheduledMessage } from '@src/domains/messaging/types';

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
  subtitle: {
    onboarding: (position, total) => `Mensagem ${position} de ${total}`,
    daily: (week, position, total) => `Semana ${week}; Mensagem ${position} de ${total}`,
  },
};

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

  it('companies them minutes after enrolment, in order', () => {
    const onboarding = plan().filter((m) => m.sequence === 'onboarding');
    expect(onboarding.map((m) => m.scheduledFor - ENROLLED_AT)).toEqual([
      2 * MINUTE,
      5 * MINUTE,
      12 * MINUTE,
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

  it('labels week and position in the subtitle', () => {
    const subtitles = daily().map((m) => m.subtitle);
    expect(subtitles[0]).toBe('Semana 1; Mensagem 1 de 7');
    expect(subtitles[6]).toBe('Semana 1; Mensagem 7 de 7');
    expect(subtitles[7]).toBe('Semana 2; Mensagem 1 de 7');
    expect(subtitles[13]).toBe('Semana 2; Mensagem 7 de 7');
  });

  it('keeps the whole plan strictly ordered', () => {
    const times = plan().map((m) => m.scheduledFor);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('never reuses a slot key', () => {
    const keys = plan().map((m) => slotKey(m.sequence, m.position));
    expect(new Set(keys).size).toBe(keys.length);
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

  it('records a past-due slot as delivered even when the plan has drifted', () => {
    const first = plan()[0];
    const delivered = asRow(first);
    const now = first.scheduledFor + 60_000;

    const drifted = plan().map((message) =>
      message.position === first.position && message.sequence === first.sequence
        ? { ...message, scheduledFor: message.scheduledFor + 4 * 60 * 60 * 1_000 }
        : message,
    );

    const diff = diffSchedule(drifted, [delivered], { now, horizon: 5 });

    expect(diff.toMarkDelivered).toEqual([delivered]);
    expect(diff.toCancel).toEqual([]);
  });

  it('marks past-due rows as delivered instead of re-queueing them', () => {
    const rows = plan().slice(0, 3).map((m) => asRow(m));
    const later = ENROLLED_AT + 30 * MINUTE;

    const diff = diffSchedule(plan(), rows, { now: later, horizon: 5 });
    expect(diff.toMarkDelivered.map((r) => r.messageId)).toEqual(['onb-0', 'onb-1', 'onb-2']);
    expect(diff.toSchedule.every((m) => m.sequence === 'daily')).toBe(true);
  });

  it('tops the window up after a long gap without duplicating anything', () => {
    const rows = plan().slice(0, 10).map((m) => asRow(m));
    const later = plan()[9].scheduledFor + MINUTE;

    const diff = diffSchedule(plan(), rows, { now: later, horizon: 5 });
    expect(diff.toMarkDelivered).toHaveLength(10);

    const scheduledKeys = diff.toSchedule.map((m) => slotKey(m.sequence, m.position));
    const deliveredKeys = diff.toMarkDelivered.map((r) => slotKey(r.sequence, r.position));
    expect(scheduledKeys.some((key) => deliveredKeys.includes(key))).toBe(false);
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

  it('re-schedules when the OS lost the notification', () => {
    const window = selectWindow(plan(), now, 3);
    const rows = window.map((m) => asRow(m));
    const live = new Set([rows[0].notificationId!]);

    const diff = diffSchedule(plan(), rows, { now, horizon: 3, liveNotificationIds: live });
    expect(diff.toSchedule.map((m) => m.messageId)).toEqual([
      window[1].messageId,
      window[2].messageId,
    ]);
  });

});
