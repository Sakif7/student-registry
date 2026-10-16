// Actions that can be reversed straight away say what they did with an Undo
// button, which makes the opposite change.
import { expect, type Page, test } from "@playwright/test";

import {
  assessmentPath,
  demoStudent,
  loadDemoData,
  viewAs,
} from "./support/helpers";

test.beforeAll(loadDemoData);

/** The toasts that confirm what was done. */
const toasts = (page: Page) =>
  page.getByRole("region", { name: /^Notifications/ });

test("withholding results, and lifting a hold, can each be undone", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("liam")}?tab=results`);
  const results = page.getByRole("region", { name: "Results" });
  await results.getByRole("button", { name: "Withhold results" }).click();
  await page
    .getByRole("dialog", { name: /^Withhold/ })
    .getByRole("button", { name: "Withhold results" })
    .click();
  await expect(
    toasts(page).getByText("Results withheld for Liam O'Connor."),
  ).toBeVisible();
  await expect(
    results.getByRole("button", { name: "Lift the hold" }),
  ).toBeVisible();

  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    toasts(page).getByText("Hold lifted for Liam O'Connor."),
  ).toBeVisible();
  await expect(
    results.getByRole("button", { name: "Withhold results" }),
  ).toBeVisible();

  // Undo puts a hold back with its reason.
  await page.goto(`/staff/students/${demoStudent("amelia")}?tab=results`);
  await results.getByRole("button", { name: "Lift the hold" }).click();
  await expect(
    toasts(page).getByText("Hold lifted for Amelia Hart."),
  ).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    toasts(page).getByText("Results withheld again for Amelia Hart."),
  ).toBeVisible();
  await expect(results.getByText("Outstanding tuition fees")).toBeVisible();
});

test("closing an assessment can be undone", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto(await assessmentPath(page, "Database design report"));
  await page.getByRole("button", { name: "Close to submissions" }).click();
  await page
    .getByRole("dialog", { name: "Close to submissions?" })
    .getByRole("button", { name: "Close to submissions" })
    .click();
  await expect(toasts(page).getByText("Closed to submissions.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reopen to submissions" }),
  ).toBeVisible();

  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    toasts(page).getByText("Reopened to submissions."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close to submissions" }),
  ).toBeVisible();
});
