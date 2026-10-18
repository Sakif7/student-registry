// Helpers for the end-to-end tests: loading the demo data, signing in, and
// working out the IDs and dates the demo data uses today.
import { execSync } from "node:child_process";

import { expect, type Page } from "@playwright/test";

import {
  academicYearOn,
  formatAcademicYear,
  startYearOf,
} from "@/domain/academic-year";
import { addDays, todayIn } from "@/domain/college-time";

import { SESSION_COOKIE } from "../../tests/helpers/session-cookie";
import { assertTestDatabaseUrl } from "../../tests/helpers/test-database";

import { E2E_PORT, e2eEnv } from "./env";

// Session cookies for the demo users, made each time the demo data loads.
let demoSessions: Record<string, string> = {};

/**
 * Resets the test database (and the test upload folder) to the demo data, as
 * `npm run db:seed` does for the app's own database, then signs in every demo
 * user who can sign in, for {@link viewAs}.
 */
export function loadDemoData(): void {
  const env = e2eEnv();
  assertTestDatabaseUrl(env.DATABASE_URL);
  const options = { env: { ...process.env, ...env }, stdio: "pipe" } as const;
  execSync("npx tsx prisma/seed.ts", options);
  demoSessions = JSON.parse(
    execSync("npx tsx e2e/support/demo-sessions.ts", options).toString(),
  ) as Record<string, string>;
}

/** A student ID, e.g. "SMS-2026-0001". */
export type StudentNumber = `SMS-${string}`;

/**
 * Signs the browser in as the first demo staff member or as one student,
 * without the sign-in form (sign-in.spec.ts tests that). The page's requests
 * share the browser's cookies, so pages opened afterwards see the session.
 */
export async function viewAs(
  page: Page,
  viewer: "staff" | StudentNumber,
): Promise<void> {
  const value = demoSessions[viewer];
  if (!value) {
    throw new Error(
      `No session for ${viewer}: load the demo data first, and check they can sign in.`,
    );
  }
  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value,
      url: `http://localhost:${E2E_PORT}`,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Opens the signed-in person's menu, at the foot of the sidebar, which holds
 * "Your account" and "Sign out".
 */
export async function openUserMenu(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

const TIME_ZONE = "Europe/London";

/** The start year of the current academic year, e.g. 2026 for 2026/27. */
export function currentIntakeYear(): number {
  return startYearOf(academicYearOn(todayIn(TIME_ZONE)));
}

/** An academic year from the current one, e.g. "2026/27" for 0. */
export function academicYearFromNow(years: number): string {
  return formatAcademicYear(currentIntakeYear() + years);
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
  tomasz: [3, 1],
} as const;

/** A demo student's ID, e.g. demoStudent("oliver") → "SMS-2026-0001". */
export function demoStudent(key: keyof typeof DEMO_STUDENTS): StudentNumber {
  const [sequence, yearsAgo] = DEMO_STUDENTS[key];
  return studentNumber(sequence, yearsAgo);
}

/**
 * The staff page of a demo assessment, found by its title through the API.
 * The page must be signed in as staff.
 */
export async function assessmentPath(
  page: Page,
  title: string,
): Promise<string> {
  const { assessments } = (await (
    await page.request.get("/api/assessments")
  ).json()) as { assessments: { id: string; title: string }[] };
  const assessment = assessments.find((a) => a.title === title);
  return `/staff/assessments/${assessment?.id ?? ""}`;
}
