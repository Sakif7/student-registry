// Enrolling, finding and managing student records, as Registry staff.
import { expect, test } from "@playwright/test";

import {
  demoStudent,
  loadDemoData,
  studentNumber,
  viewAs,
} from "./support/helpers";

// The tests build on each other: the student enrolled first is found next.
test.describe.configure({ mode: "serial" });

test.beforeAll(loadDemoData);

test.beforeEach(async ({ page }) => {
  await viewAs(page, "staff");
});

test("enrols a student with the next ID in this year's sequence", async ({
  page,
}) => {
  await page.goto("/staff/students/new");
  await page.getByRole("button", { name: "Enrol student" }).click();
  const errors = page.getByRole("alert");
  await expect(
    errors.filter({ hasText: "Enter the student's full name" }),
  ).toBeVisible();
  await expect(errors.filter({ hasText: "Choose a programme" })).toBeVisible();

  await page.getByLabel("Full name").fill("Grace Thompson");
  await page.getByLabel("Email").fill("Grace.Thompson@Student.Example");
  await page.getByLabel("Date of birth").fill("2005-03-12");
  await page.getByLabel("Programme").selectOption("BSC-CS");
  await page.getByRole("button", { name: "Enrol student" }).click();

  // The demo data has used 0001 to 0007 for this year's intake.
  await expect(page).toHaveURL(`/staff/students/${studentNumber(8)}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Grace Thompson" }),
  ).toBeVisible();
  // In lower case, among the record's details.
  await expect(
    page
      .getByRole("definition")
      .filter({ hasText: "grace.thompson@student.example" }),
  ).toBeVisible();
  await expect(page.getByText("Record created as Enrolled")).toBeVisible();
});

test("refuses an email address another student already uses", async ({
  page,
}) => {
  await page.goto("/staff/students/new");
  await page.getByLabel("Full name").fill("Grace Duplicate");
  await page.getByLabel("Email").fill("GRACE.THOMPSON@student.example");
  await page.getByLabel("Date of birth").fill("2005-03-12");
  await page.getByLabel("Programme").selectOption("BSC-CS");
  await page.getByRole("button", { name: "Enrol student" }).click();

  await expect(
    page.getByText("Another student already uses this email address"),
  ).toBeVisible();
  await expect(page).toHaveURL("/staff/students/new");
});

test("finds students by name and filters them by status", async ({ page }) => {
  await page.goto("/staff/students");
  await page.getByLabel("Search").fill("grace");
  // Exactly: the search in the top bar is "Search…".
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=grace/);
  await expect(
    page.getByRole("link", { name: "Grace Thompson" }),
  ).toBeVisible();
  await expect(page.getByText("Showing 1–1 of 1 student")).toBeVisible();

  await page.goto("/staff/students?status=WITHDRAWN");
  await expect(
    page.getByRole("link", { name: "Hannah Kowalski" }),
  ).toBeVisible();
  await expect(page.getByText("Showing 1–1 of 1 student")).toBeVisible();
});

test("defers a student with a reason, kept in the status history", async ({
  page,
}) => {
  await page.goto(`/staff/students/${demoStudent("oliver")}`);
  await page.getByRole("button", { name: "Change status" }).click();
  const dialog = page.getByRole("dialog", { name: "Change status" });
  await dialog.getByLabel("New status").selectOption("DEFERRED");
  await dialog.getByRole("button", { name: "Change status" }).click();
  await expect(
    dialog.getByText("Give a reason for deferral or withdrawal"),
  ).toBeVisible();

  await dialog.getByLabel("Reason (required)").fill("Family circumstances");
  await dialog.getByRole("button", { name: "Change status" }).click();
  await expect(dialog).toBeHidden();

  // In the status history (the History card, below, records it too).
  const statusHistory = page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { name: "Status history" }) });
  await expect(statusHistory.getByText("Family circumstances")).toBeVisible();
  // The list reflects the change straight away, even going back to it.
  await page.goto("/staff/students?status=DEFERRED");
  await expect(
    page.getByRole("link", { name: "Oliver Bennett" }),
  ).toBeVisible();
});
