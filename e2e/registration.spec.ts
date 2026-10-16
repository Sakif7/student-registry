// Module registration: staff adding and dropping a student's options on the
// student's record, and students choosing their own while staff let them.
import { expect, type Page, test } from "@playwright/test";

import { formatAcademicYear } from "@/domain/academic-year";

import {
  currentIntakeYear,
  demoStudent,
  loadDemoData,
  viewAs,
} from "./support/helpers";

test.beforeAll(loadDemoData);

const toasts = (page: Page) =>
  page.getByRole("region", { name: /^Notifications/ });
const registered = (page: Page) =>
  page.getByRole("table", { name: /^Modules registered/ });
const options = (page: Page) => page.getByRole("table", { name: /^Options/ });

test("staff add an option for a student short of credits, and undo it", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("priya")}?tab=modules`);
  // Priya has 15 of the year's 120 credits still to choose.
  await expect(page.getByText("105 of 120 credits")).toBeVisible();
  await expect(
    registered(page).getByRole("row", { name: /CS4001/ }),
  ).toContainText("Core");
  await expect(
    registered(page).getByRole("button", { name: "Drop CS4001" }),
  ).toHaveCount(0);

  await options(page).getByRole("button", { name: "Add CS4004" }).click();
  await expect(
    registered(page).getByRole("row", { name: /CS4004 Mathematics/ }),
  ).toContainText("Optional");
  await expect(page.getByText("120 of 120 credits")).toBeVisible();
  // The year is full, so the other option no longer fits.
  await expect(
    options(page).getByRole("row", { name: /CS4005/ }),
  ).toContainText("Too many credits");

  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    registered(page).getByRole("row", { name: /CS4004/ }),
  ).toHaveCount(0);
  await expect(
    options(page).getByRole("button", { name: "Add CS4004" }),
  ).toBeVisible();
});

test("students choose their own options only while staff let them", async ({
  page,
}) => {
  const priya = demoStudent("priya");
  const year = formatAcademicYear(currentIntakeYear());
  await viewAs(page, priya);
  await page.goto("/student/modules");
  await expect(
    page.getByText(
      "Choosing modules isn't open just now. Contact the Registry to change your modules.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Add|Drop) / })).toHaveCount(
    0,
  );

  await viewAs(page, "staff");
  await page.goto("/staff/academic-years");
  const thisYear = page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { name: year }) });
  await thisYear.getByRole("button", { name: "Let students choose" }).click();
  await expect(
    thisYear.getByText("Students choose their own optional modules."),
  ).toBeVisible();

  // The student's home asks them to choose.
  await viewAs(page, priya);
  await page.goto("/student");
  await expect(
    page.getByText(`You have 15 credits to choose for ${year}.`),
  ).toBeVisible();
  await page.getByRole("link", { name: "Choose your modules" }).click();
  await expect(page).toHaveURL("/student/modules");

  await options(page).getByRole("button", { name: "Add CS4005" }).click();
  await expect(toasts(page)).toContainText("Added CS4005.");
  await expect(
    registered(page).getByRole("row", { name: /CS4005 Professional/ }),
  ).toContainText("Optional");
  // Options can be dropped, core modules can't.
  await expect(
    registered(page).getByRole("button", { name: "Drop CS4001" }),
  ).toHaveCount(0);
  await registered(page).getByRole("button", { name: "Drop AI4001" }).click();
  await expect(toasts(page)).toContainText("Dropped AI4001.");
  await expect(
    registered(page).getByRole("row", { name: /AI4001/ }),
  ).toHaveCount(0);
});
