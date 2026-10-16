// Settings shared by the Playwright configuration and the end-to-end tests.
// The app under test and the demo-data loader both use the disposable test
// database, never the app's own.
import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_PORT = 3100;

/** The folder the app under test stores uploads in; emptied by the seed. */
const E2E_UPLOAD_DIR = join(tmpdir(), "student-registry-e2e-uploads");

/** The app under test's sign-in secret, which signs its session cookies. */
export const E2E_AUTH_SECRET = "end-to-end-tests-only-secret-0123456789";

/** Environment for the app under test and for loading the demo data. */
export function e2eEnv(): Record<string, string> {
  return {
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
    APP_TIME_ZONE: "Europe/London",
    UPLOAD_DIR: E2E_UPLOAD_DIR,
    BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
    BETTER_AUTH_URL: `http://localhost:${E2E_PORT}`,
    SHOW_DEMO_ACCOUNTS: "true",
  };
}
