// Web fallback: sql.js (in-memory wasm SQLite, main thread — no worker/OPFS needed).
// Demo/dev only: data resets on page reload. Native uses ./client.ts (expo-sqlite).

import { drizzle, SQLJsDatabase } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import * as schema from './schema';

// Metro serves .wasm as an asset URL (metro.config.js adds it to assetExts).
import wasmUrl from 'sql.js/dist/sql-wasm.wasm';

export let db: SQLJsDatabase<typeof schema>;

export async function initWebDb(migrationSql: string): Promise<void> {
  if (db) return;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sqlite = new SQL.Database();
  for (const stmt of migrationSql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed) sqlite.run(trimmed);
  }
  db = drizzle(sqlite, { schema });
}

export { schema };
