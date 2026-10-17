// Automated accessibility checks (axe, WCAG 2.1 A and AA) on every kind of
// page, as staff and as a student. They catch missing labels, names and
// contrast problems; keyboard use and screen-reader wording still need a
// person to check.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import {
  assessmentPath,
  demoStudent,
  loadDemoData,
  viewAs,
} from "./support/helpers";

test.beforeAll(loadDemoData);

async function expectNoViolations(page: Page, path: string): Promise<void> {
  await page.goto(path);
  // Wait for streamed content to replace the loading placeholders.
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
  await scan(page, path);
}

/** Scans what the page shows now, or only part of it. */
async function scan(page: Page, label: string, include?: string) {
  // Let opening animations finish first: text halfway through fading in
  // fails the contrast check. Endless ones (such as a pulse) never finish,
  // nor do those tied to scrolling (the fade at a table's edge), which follow
  // the scroll position rather than the clock.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline instanceof DocumentTimeline &&
            animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  let axe = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  if (include) axe = axe.include(include);
  const { violations } = await axe.analyze();
  expect(
    violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target.join(" ")),
    })),
    label,
  ).toEqual([]);
}

test("signed-out pages", async ({ page }) => {
  for (const path of [
    "/login",
    "/forgot-password",
    "/reset-password?token=example",
    "/activate?error=INVALID_TOKEN",
  ]) {
    await expectNoViolations(page, path);
  }
});

test("staff pages", async ({ page }) => {
  await viewAs(page, "staff");
  const marksheet = await assessmentPath(page, "Algorithms coursework");
  for (const path of [
    "/staff",
    "/staff/students",
    "/staff/students/new",
    "/staff/assessments",
    "/staff/assessments/new",
    marksheet,
    "/staff/results",
    "/staff/account",
    "/staff/activity",
  ]) {
    await expectNoViolations(page, path);
  }
});

test("each tab of a student's record", async ({ page }) => {
  await viewAs(page, "staff");
  for (const tab of [
    "",
    "?tab=modules",
    "?tab=fees",
    "?tab=assessments",
    "?tab=results",
    "?tab=history",
    "?tab=sign-in",
  ]) {
    await expectNoViolations(
      page,
      `/staff/students/${demoStudent("amelia")}${tab}`,
    );
  }
});

test("curriculum pages", async ({ page }) => {
  await viewAs(page, "staff");
  for (const path of [
    "/staff/programmes",
    "/staff/programmes/BSC-CS",
    "/staff/modules",
    "/staff/academic-years",
  ]) {
    await expectNoViolations(page, path);
  }
});

test("student pages", async ({ page }) => {
  await viewAs(page, "staff");
  const id = (await assessmentPath(page, "Database design report")).split(
    "/",
  )[3];
  await viewAs(page, demoStudent("priya"));
  for (const path of [
    "/student",
    "/student/modules",
    "/student/assessments",
    `/student/assessments/${id ?? ""}`,
    "/student/results",
    "/student/fees",
    "/student/record",
    "/student/account",
  ]) {
    await expectNoViolations(page, path);
  }
});

test("dialogs on a student's record", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("amelia")}?tab=fees`);
  for (const button of [
    "Edit details",
    "Change status",
    "Record a payment",
    "Charge a fee",
  ]) {
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, button, "[role=dialog]");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});

test("dialogs on the curriculum pages", async ({ page }) => {
  await viewAs(page, "staff");
  for (const [path, button] of [
    ["/staff/programmes", "Set up a programme"],
    ["/staff/programmes/BSC-CS", "Add a module"],
    ["/staff/modules", "Set up a module"],
    ["/staff/academic-years", /^Set up \d{4}\/\d{2}$/],
  ] as const) {
    await page.goto(path);
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await scan(page, path, "[role=dialog]");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});
