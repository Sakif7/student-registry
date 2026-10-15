// Automated accessibility checks (axe, WCAG 2.1 A and AA) on every kind of
// page, as staff and as a student. They catch missing labels, names and
// contrast problems; keyboard use and screen-reader wording still need a
// person to check.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

async function expectNoViolations(page: Page, path: string): Promise<void> {
  await page.goto(path);
  // Wait for streamed content to replace the loading placeholders.
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target.join(" ")),
    })),
    path,
  ).toEqual([]);
}

async function assessmentPath(page: Page, title: string): Promise<string> {
  const { assessments } = (await (
    await page.request.get("/api/assessments")
  ).json()) as { assessments: { id: string; title: string }[] };
  const assessment = assessments.find((a) => a.title === title);
  return `/staff/assessments/${assessment?.id ?? ""}`;
}

test("the view picker", async ({ page }) => {
  await expectNoViolations(page, "/");
});

test("staff pages", async ({ page }) => {
  await viewAs(page, "staff");
  const marksheet = await assessmentPath(page, "Algorithms coursework");
  for (const path of [
    "/staff",
    "/staff/students",
    "/staff/students/new",
    `/staff/students/${demoStudent("amelia")}`,
    `/staff/students/${demoStudent("amelia")}/edit`,
    "/staff/assessments",
    "/staff/assessments/new",
    marksheet,
    "/staff/results",
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
    "/student/assessments",
    `/student/assessments/${id ?? ""}`,
    "/student/results",
  ]) {
    await expectNoViolations(page, path);
  }
});
