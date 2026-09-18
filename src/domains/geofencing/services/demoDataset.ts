import { transaction } from '@src/core/db';
import { logger } from '@src/core/logger';

import dataset from '@src/__fixtures__/companies.json';
import { invalidateCompanyCaches, seedCompanies, type SeedPayload } from './companyRepository';

const TAG = 'demo-dataset';

const payload = dataset as SeedPayload;

export const DEMO_DATASET_SIZE = payload.companies.length;

const ids = () => payload.companies.map((company) => company.id);

export function loadDemoDataset(): number {
  const inserted = seedCompanies(payload, { replace: false });
  logger.info(TAG, 'demo dataset loaded', { companies: inserted });
  return inserted;
}

export function removeDemoDataset(): number {
  const targets = ids();
  const placeholders = targets.map(() => '?').join(',');

  const removed = transaction((db) => {
    db.runSync(`DELETE FROM monitor_state WHERE company_id IN (${placeholders});`, targets);
    db.runSync(`DELETE FROM rooms WHERE company_id IN (${placeholders});`, targets);
    return db.runSync(`DELETE FROM companies WHERE id IN (${placeholders});`, targets).changes;
  });

  invalidateCompanyCaches();
  logger.info(TAG, 'demo dataset removed', { companies: removed });
  return removed;
}
