// Helpers for the end-to-end tests: loading the demo data, choosing a view,
// and working out the IDs and dates the demo data uses today.
import { execSync } from "node:child_process";

import { expect, type Page } from "@playwright/test";

import { academicYearOn, startYearOf } from "@/domain/academic-year";
import { addDays, todayIn } from "@/domain/college-time";

import { assertTestDatabaseUrl } from "../../tests/helpers/test-database";

import { e2eEnv } from "./env";

/**
 * Resets the test database (and the test upload folder) to the demo data, as
 * `npm run db:seed` does for the app's own database.
 */
export function loadDemoData(): void {
  const env = e2eEnv();
  assertTestDatabaseUrl(env.DATABASE_URL);
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
}

/** A student ID, e.g. "SMS-2026-0001". */
export type StudentNumber = `SMS-${string}`;

/**
 * Starts a session for staff or for one student, as the view picker does.
 * The page's requests share the browser's cookies, so pages opened afterwards
 * see the session.
 */
export async function viewAs(
  page: Page,
  viewer: "staff" | StudentNumber,
): Promise<void> {
  const response = await page.request.post("/api/session", {
    data:
      viewer === "staff"
        ? { role: "staff" }
        : { role: "student", studentNumber: viewer },
  });
  expect(response.ok()).toBe(true);
}

const TIME_ZONE = "Europe/London";

/** The start year of the current academic year, e.g. 2026 for 2026/27. */
export function currentIntakeYear(): number {
  return startYearOf(academicYearOn(todayIn(TIME_ZONE)));
}

/**
 * A student number from the demo data, for this year's intake (the seed
 * numbers students relative to the current academic year).
 *
 * @param yearsAgo - 0 for this year's intake, 1 for last year's.
 */
export function studentNumber(sequence: number, yearsAgo = 0): StudentNumber {
  const year = currentIntakeYear() - yearsAgo;
  return `SMS-${year}-${String(sequence).padStart(4, "0")}`;
}

/** A date this many days from today, as a datetime-local field takes it. */
export function deadlineInDays(days: number, time = "17:00"): string {
  return `${addDays(todayIn(TIME_ZONE), days)}T${time}`;
}

// Each demo student's place in the seed's numbering: [sequence, intake years
// before the current one].
const DEMO_STUDENTS = {
  mohammed: [1, 3],
  amelia: [1, 1],
  kwame: [2, 1],
  oliver: [1, 0],
  priya: [2, 0],
  sofia: [3, 0],
  liam: [4, 0],
  hannah: [5, 0],
  chloe: [6, 0],
  arjun: [7, 0],
} as const;

/** A demo student's ID, e.g. demoStudent("oliver") → "SMS-2026-0001". */
export function demoStudent(key: keyof typeof DEMO_STUDENTS): StudentNumber {
  const [sequence, yearsAgo] = DEMO_STUDENTS[key];
  return studentNumber(sequence, yearsAgo);
}
