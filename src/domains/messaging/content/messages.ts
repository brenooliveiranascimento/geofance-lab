import i18n from '@src/i18n';

import type { MessageDefinition } from '../types';
import type { SubtitleFormatter } from '../services/sequencePlanner';

export const ONBOARDING_MESSAGE_IDS = ['onb-01', 'onb-02', 'onb-03', 'onb-04', 'onb-05'] as const;

export const DAILY_MESSAGE_IDS = [
  'd-1-1', 'd-1-2', 'd-1-3', 'd-1-4', 'd-1-5', 'd-1-6', 'd-1-7',
  'd-2-1', 'd-2-2', 'd-2-3', 'd-2-4', 'd-2-5', 'd-2-6', 'd-2-7',
  'd-3-1', 'd-3-2', 'd-3-3', 'd-3-4', 'd-3-5', 'd-3-6', 'd-3-7',
  'd-4-1', 'd-4-2', 'd-4-3', 'd-4-4', 'd-4-5', 'd-4-6', 'd-4-7',
] as const;

const resolve = (id: string): MessageDefinition => ({
  id,
  title: i18n.t(`messages.content.${id}.title`),
  body: i18n.t(`messages.content.${id}.body`),
});

export const onboardingMessages = (): MessageDefinition[] => ONBOARDING_MESSAGE_IDS.map(resolve);

export const dailyMessages = (): MessageDefinition[] => DAILY_MESSAGE_IDS.map(resolve);

export const subtitleFormatter: SubtitleFormatter = {
  onboarding: (position, total) => i18n.t('messages.subtitle.onboarding', { position, total }),
  daily: (week, position, total) => i18n.t('messages.subtitle.daily', { week, position, total }),
};
