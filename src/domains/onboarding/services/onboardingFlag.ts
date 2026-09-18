import { readJson, writeJson } from '@src/core/db';

const KEY = 'onboarding.completed';

export const isOnboardingCompleted = (): boolean => readJson<boolean>(KEY) ?? false;

export const setOnboardingCompleted = (completed: boolean): void => writeJson(KEY, completed);
