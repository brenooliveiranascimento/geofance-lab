import { getDatabase, readJson, writeJson } from '@src/core/db';
import { logger } from '@src/core/logger';
import { APP_CONFIG } from '@src/config/app';
import { countPlaces, seedPlaces, type SeedPayload } from '@src/domains/geofencing/services/placeRepository';

const SEED: SeedPayload = require('../../assets/seed/places.json');

const SEEDED_KEY = 'app.seededAt';

/** Number of places bundled with the app. */
export const SEED_SIZE = SEED.places.length;

/** Reloads the bundled dataset, discarding any local edits. */
export function reseed(): number {
  const count = seedPlaces(SEED, { replace: true });
  writeJson(SEEDED_KEY, Date.now());
  return count;
}

/**
 * Prepares the database before the first screen renders.
 *
 * Synchronous on purpose: the migrations and the seed both run through
 * expo-sqlite's sync API, so there is no window in which a background task could
 * observe a half-built schema. The seed only runs when the table is empty, so a
 * user's own places are never overwritten by a restart.
 */
export function bootstrapDatabase(): void {
  getDatabase();

  if (!APP_CONFIG.autoSeedOnFirstLaunch) return;
  if (countPlaces() > 0) return;

  const started = Date.now();
  const count = reseed();
  logger.info('bootstrap', 'seeded on first launch', {
    places: count,
    ms: Date.now() - started,
  });
}

export const readSeededAt = (): number | null => readJson<number>(SEEDED_KEY);
