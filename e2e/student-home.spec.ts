// A student's home page: their next deadline, fees and latest results at a
// glance, then every assessment still taking work.
import { expect, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

test("a student sees where they stand, and goes on from there", async ({
  page,
}) => {
  await viewAs(page, demoStudent("priya"));
  await page.goto("/student");

  const next = page.getByRole("region", { name: "Next deadline" });
  await expect(
    next.getByRole("link", { name: "Systems lab report" }),
  ).toBeVisible();
  await expect(next.getByText("Submitted")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Fees", exact: true }),
  ).toContainText("Nothing to pay");
  await expect(
    page.getByRole("region", { name: "Latest results" }).getByRole("listitem"),
  ).toHaveText([/^Algorithms coursework.*58\s*Pass$/]);

  const work = page.getByRole("region", { name: "Assessments taking work" });
  await expect(work.getByRole("row")).toHaveText([
    /^Assessment/,
    /^Systems lab report.*Open\s*Submitted$/,
    /^Database design report.*Past deadline\s*Not submitted$/,
  ]);
  await work.getByRole("link", { name: "Database design report" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Database design report" }),
  ).toBeVisible();
});

test("a student whose fees are overdue and results withheld is told so", async ({
  page,
}) => {
  await viewAs(page, demoStudent("amelia"));
  await page.goto("/student");

  const fees = page.getByRole("region", { name: "Fees", exact: true });
  await expect(fees).toContainText("£9,535.00 to pay");
  await expect(fees).toContainText("£9,535.00 overdue since");
  await expect(
    page.getByRole("region", { name: "Latest results" }),
  ).toContainText("Your results are being withheld: Outstanding tuition fees.");

  await fees.getByRole("link", { name: "Your fees" }).click();
  await expect(page).toHaveURL("/student/fees");
  await expect(
    page.getByRole("heading", { level: 1, name: "My fees" }),
  ).toBeVisible();
});

test("a student searches their own assessments", async ({ page }) => {
  await viewAs(page, demoStudent("priya"));
  await page.goto("/student/assessments");
  await page
    .getByRole("searchbox", { name: "Search" })
    .pressSequentially("lab");

  await expect(page).toHaveURL(/q=lab/);
  await expect(page.getByText("Showing 1–1 of 1 assessment")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Systems lab report" }),
  ).toBeVisible();
});
