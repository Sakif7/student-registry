// Fees and payments: overdue balances on the dashboard, recording a payment,
// and a student's own view of their account.
import { expect, type Page, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

/** The "Record a payment" form on a staff record page. */
function paymentForm(page: Page) {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Record payment" }) });
}

test("a payment clears an overdue balance from the dashboard", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff");
  const overdue = page.getByRole("region", { name: "Overdue fees" });
  await expect(overdue.getByText("3 students owe")).toBeVisible();
  await expect(
    overdue.getByRole("link", { name: "Kwame Mensah" }),
  ).toBeVisible();

  await overdue.getByRole("link", { name: "Kwame Mensah" }).click();
  await expect(page).toHaveURL(`/staff/students/${demoStudent("kwame")}`);
  await paymentForm(page).getByLabel("Amount (£)").fill("4535");
  await paymentForm(page).getByLabel("Reference").fill("CARD KM 0002");
  await paymentForm(page)
    .getByRole("button", { name: "Record payment" })
    .click();
  await expect(
    page.getByRole("cell", { name: "CARD KM 0002", exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(overdue.getByText("2 students owe")).toBeVisible();
  await expect(overdue.getByRole("link", { name: "Kwame Mensah" })).toHaveCount(
    0,
  );
});

test("the same reference can't be recorded twice", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("amelia")}`);
  await paymentForm(page).getByLabel("Amount (£)").fill("100");
  // Seeded already, typed here with different case and spacing.
  await paymentForm(page).getByLabel("Reference").fill("bacs  ah 2025-1");
  await paymentForm(page)
    .getByRole("button", { name: "Record payment" })
    .click();

  await expect(
    page.getByText(
      "A payment with reference BACS AH 2025-1 is already recorded",
    ),
  ).toBeVisible();
});

test("a student sees their own account, without staff controls", async ({
  page,
}) => {
  await viewAs(page, demoStudent("liam"));
  await page.goto("/student");

  await expect(page.getByText("In credit").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record payment" }),
  ).toHaveCount(0);
});
