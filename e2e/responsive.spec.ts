// On a phone, no page scrolls sideways: a wide table scrolls inside its own
// box instead, and everything else wraps or stacks.
import { expect, type Page, test } from "@playwright/test";

import {
  assessmentPath,
  demoStudent,
  loadDemoData,
  viewAs,
} from "./support/helpers";

test.beforeAll(loadDemoData);
test.use({ viewport: { width: 390, height: 844 } });

async function expectNoSidewaysScroll(page: Page, path: string) {
  await page.goto(path);
  // Wait for streamed content to replace the loading placeholders.
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
  }));
  expect(width.page, path).toBeLessThanOrEqual(width.window);
}

test("signed-out pages fit a phone", async ({ page }) => {
  for (const path of ["/login", "/forgot-password"]) {
    await expectNoSidewaysScroll(page, path);
  }
});

test("staff pages fit a phone", async ({ page }) => {
  await viewAs(page, "staff");
  const marksheet = await assessmentPath(page, "Algorithms coursework");
  const record = `/staff/students/${demoStudent("amelia")}`;
  for (const path of [
    "/staff",
    "/staff/students",
    "/staff/students/new",
    ...[
      "overview",
      "modules",
      "fees",
      "assessments",
      "results",
      "history",
      "sign-in",
    ].map((tab) => `${record}?tab=${tab}`),
    "/staff/assessments",
    "/staff/assessments/new",
    marksheet,
    "/staff/results",
    "/staff/activity",
    "/staff/programmes",
    "/staff/programmes/BSC-CS",
    "/staff/modules",
    "/staff/academic-years",
    "/staff/account",
  ]) {
    await expectNoSidewaysScroll(page, path);
  }
});

test("student pages fit a phone", async ({ page }) => {
  await viewAs(page, "staff");
  const assessment = await assessmentPath(page, "Database design report");
  await viewAs(page, demoStudent("priya"));
  for (const path of [
    "/student",
    "/student/modules",
    "/student/assessments",
    assessment.replace("/staff/", "/student/"),
    "/student/results",
    "/student/fees",
    "/student/record",
    "/student/account",
  ]) {
    await expectNoSidewaysScroll(page, path);
  }
});
