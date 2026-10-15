// Safety checks and clean-up for the integration test database.

/**
 * Throws unless the URL points at a disposable test database. Tests empty
 * every table, so they must never run against the app's own database.
 *
 * @param url - A postgresql:// connection URL.
 * @throws Error when the URL is missing, malformed, or not a `*_test` database.
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Copy .env.example to .env (or set it in the environment).",
    );
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}": the test database name must end in "_test".`,
    );
  }
  return url;
}

/** SQL that empties every table except Prisma's migration history. */
export const TRUNCATE_ALL_TABLES_SQL = `
  DO $$
  DECLARE tables text;
  BEGIN
    SELECT string_agg(format('%I', tablename), ', ') INTO tables
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
    IF tables IS NOT NULL THEN
      EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
    END IF;
  END $$`;
