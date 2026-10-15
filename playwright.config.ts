// End-to-end tests: journeys through the production build in a real browser,
// against the disposable test database loaded with the demo data. They share
// one database, so they run one at a time.
import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import { E2E_PORT, e2eEnv } from "./e2e/support/env";

// Variables already set in the environment (e.g. in CI) take precedence.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: "en-GB",
    timezoneId: "Europe/London",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The production build, as users get it, rather than the dev server.
    command: `npm run build && npx next start --port ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: e2eEnv(),
  },
});
