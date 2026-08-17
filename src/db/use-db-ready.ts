// Native: drizzle migrations via expo-sqlite hook.

import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from './client';
import migrations from './migrations/migrations';

export function useDbReady(): { success: boolean; error?: Error } {
  return useMigrations(db, migrations);
}
