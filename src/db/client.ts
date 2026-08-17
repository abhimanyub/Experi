// DB entry point for the app (used from M2 onward).
// Domain logic never imports this — it stays pure and takes plain objects.

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

const sqlite = openDatabaseSync('labnote.db', { enableChangeListener: true });

export const db = drizzle(sqlite, { schema });
export { schema };
