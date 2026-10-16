// The audit trail: a change made on a student's record shows who made it,
// in the student's history and in the Activity log.
import { expect, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

test("staff see who changed what, on the record and in Activity", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("kwame")}`);
  const history = page.getByRole("region", { name: "History" });
  // The demo data's own history: Jane Okafor enrolled Kwame.
  await expect(history.getByText(/^Enrolled as SMS-/)).toBeVisible();

  const payment = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Record payment" }) });
  await payment.getByLabel("Amount (£)").fill("100");
  await payment.getByLabel("Reference").fill("CARD KM 0003");
  await payment.getByRole("button", { name: "Record payment" }).click();

  const entry = history
    .getByRole("listitem")
    .filter({ hasText: "Recorded a payment of £100.00 (CARD KM 0003)" });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Jane Okafor");

  await page.getByRole("link", { name: "Activity" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Activity" }),
  ).toBeVisible();
  const newest = page.getByRole("row").nth(1);
  await expect(newest).toContainText(
    "Recorded a payment of £100.00 (CARD KM 0003)",
  );
  await expect(newest).toContainText("Jane Okafor");
  await expect(
    newest.getByRole("link", { name: "Kwame Mensah" }),
  ).toBeVisible();
});
