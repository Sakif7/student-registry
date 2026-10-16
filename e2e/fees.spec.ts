// Fees and payments: overdue balances on the dashboard, recording a payment,
// and a student's own view of their account.
import { expect, type Page, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

/** Opens the "Record a payment" dialog on a record's Fees tab. */
async function paymentDialog(page: Page) {
  await page.getByRole("button", { name: "Record a payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await expect(dialog).toBeVisible();
  return dialog;
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
  await page.getByRole("tab", { name: "Fees" }).click();
  await expect(page).toHaveURL(
    `/staff/students/${demoStudent("kwame")}?tab=fees`,
  );
  const payment = await paymentDialog(page);
  await payment.getByLabel("Amount (£)").fill("4535");
  await payment.getByLabel("Reference").fill("CARD KM 0002");
  await payment.getByRole("button", { name: "Record payment" }).click();
  await expect(payment).toBeHidden();
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
  await page.goto(`/staff/students/${demoStudent("amelia")}?tab=fees`);
  const payment = await paymentDialog(page);
  await payment.getByLabel("Amount (£)").fill("100");
  // Seeded already, typed here with different case and spacing.
  await payment.getByLabel("Reference").fill("bacs  ah 2025-1");
  await payment.getByRole("button", { name: "Record payment" }).click();

  await expect(
    payment.getByText(
      "A payment with reference BACS AH 2025-1 is already recorded",
    ),
  ).toBeVisible();
});

test("a student sees their own account, without staff controls", async ({
  page,
}) => {
  await viewAs(page, demoStudent("liam"));
  await page.goto("/student");
  await page.getByRole("link", { name: "Fees", exact: true }).click();
  await expect(page).toHaveURL("/student/fees");

  const account = page.getByRole("region", { name: "Fees and payments" });
  await expect(account.getByText("In credit").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Record a payment|Charge a fee)$/ }),
  ).toHaveCount(0);
});
