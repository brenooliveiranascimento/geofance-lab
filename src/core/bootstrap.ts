import { getDatabase } from '@src/core/db';

export function bootstrapDatabase(): void {
  getDatabase();
}
