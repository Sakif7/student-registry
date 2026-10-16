// Test runner configuration. Two projects, both in Node:
// - unit: pure logic, no I/O (src/**/*.test.ts, next to the code);
// - integration: route handlers and services against a real PostgreSQL test
//   database (tests/integration).
// UI behaviour is covered by the Playwright end-to-end tests instead.
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Variables already set in the environment (e.g. in CI) take precedence.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const emptyModule = fileURLToPath(
  new URL("./tests/helpers/empty-module.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Next.js handles "server-only" at build time; imported anywhere else, the
    // package throws by design.
    alias: { "server-only": emptyModule },
  },
  test: {
    // Asia/Dhaka is UTC+6. Date-only values built from local time shift by a
    // day there, a bug that UTC (as on CI runners) would hide.
    env: { TZ: "Asia/Dhaka" },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/helpers/global-setup.ts"],
          setupFiles: [
            "tests/helpers/setup-database.ts",
            "tests/helpers/setup-mail.ts",
          ],
          // One database, so test files run one after another.
          fileParallelism: false,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
            APP_TIME_ZONE: "Europe/London",
            UPLOAD_DIR: join(tmpdir(), "student-registry-test-uploads"),
            BETTER_AUTH_SECRET: "integration-tests-only-secret-0123456789",
            BETTER_AUTH_URL: "http://localhost:3000",
            SHOW_DEMO_ACCOUNTS: "false",
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: [
        "src/domain/**",
        "src/server/**",
        "src/app/api/**",
        "src/lib/**",
      ],
      exclude: ["**/*.test.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
