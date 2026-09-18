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

const asRow = (message: PlannedMessage): ScheduledMessage => ({
  sequence: message.sequence,
  position: message.position,
  messageId: message.messageId,
  scheduledFor: message.scheduledFor,
  notificationId: `notif-${slotKey(message.sequence, message.position)}`,
  state: 'scheduled',
  deliveredAt: null,
});

describe('buildPlan', () => {
  it('opens with the onboarding offsets and then one message per day', () => {
    const onboarding = plan().filter((m) => m.sequence === 'onboarding');
    expect(onboarding.map((m) => m.scheduledFor - ENROLLED_AT)).toEqual([
      2 * MINUTE,
      5 * MINUTE,
      12 * MINUTE,
    ]);

    const daily = plan().filter((m) => m.sequence === 'daily');
    expect(daily[0].scheduledFor).toBeGreaterThan(onboarding.at(-1)!.scheduledFor);
    for (const message of daily) {
      expect(new Date(message.scheduledFor).getHours()).toBe(9);
    }

    const days = daily.map((m) => new Date(m.scheduledFor).toDateString());
    expect(new Set(days).size).toBe(days.length);
  });

  it('labels week and position in the subtitle', () => {
    const subtitles = plan()
      .filter((m) => m.sequence === 'daily')
      .map((m) => m.subtitle);

    expect(subtitles[0]).toBe('Semana 1; Mensagem 1 de 7');
    expect(subtitles[6]).toBe('Semana 1; Mensagem 7 de 7');
    expect(subtitles[7]).toBe('Semana 2; Mensagem 1 de 7');
  });

  it('stays ordered and never reuses a slot key', () => {
    const times = plan().map((m) => m.scheduledFor);
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const keys = plan().map((m) => slotKey(m.sequence, m.position));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('diffSchedule', () => {
  const now = ENROLLED_AT + MINUTE;

  it('tops the window up after a long gap without duplicating anything', () => {
    const rows = plan().slice(0, 10).map(asRow);
    const later = plan()[9].scheduledFor + MINUTE;

    const diff = diffSchedule(plan(), rows, { now: later, horizon: 5 });
    expect(diff.toMarkDelivered).toHaveLength(10);

    const scheduled = diff.toSchedule.map((m) => slotKey(m.sequence, m.position));
    const delivered = diff.toMarkDelivered.map((r) => slotKey(r.sequence, r.position));
    expect(scheduled.some((key) => delivered.includes(key))).toBe(false);
  });

  it('re-schedules when the OS lost the notification', () => {
    const window = selectWindow(plan(), now, 3);
    const rows = window.map(asRow);
    const live = new Set([rows[0].notificationId!]);

    const diff = diffSchedule(plan(), rows, { now, horizon: 3, liveNotificationIds: live });
    expect(diff.toSchedule.map((m) => m.messageId)).toEqual([
      window[1].messageId,
      window[2].messageId,
    ]);
  });
});
