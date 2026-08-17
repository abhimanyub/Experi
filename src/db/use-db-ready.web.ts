// Web: initialize sql.js and run the generated migration SQL once.

import { useEffect, useState } from 'react';
import { initWebDb } from './client.web';
// Inline-imported by babel-plugin-inline-import (.sql in extensions).
// @ts-expect-error raw sql import
import migrationSql from './migrations/0000_bumpy_meggan.sql';

export function useDbReady(): { success: boolean; error: Error | undefined } {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    initWebDb(migrationSql as string)
      .then(() => setSuccess(true))
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  return { success, error };
}
