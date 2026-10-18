// Moving students on to a new academic year: what flags a student still in
// last year, and the progression page that moves them on.
import { expect, test } from "@playwright/test";

import {
  academicYearFromNow,
  demoStudent,
  loadDemoData,
  viewAs,
} from "./support/helpers";

test.beforeAll(loadDemoData);

const THIS_YEAR = academicYearFromNow(0);
const LAST_YEAR = academicYearFromNow(-1);

test("flags a student not yet moved on, on the dashboard and their record", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff");
  await expect(
    page.getByText(
      `1 enrolled student is still in an earlier year than ${THIS_YEAR}`,
    ),
  ).toBeVisible();

  await page.goto(`/staff/students/${demoStudent("tomasz")}`);
  await expect(page.getByText(`${LAST_YEAR} has ended`)).toBeVisible();

  // He is told too, on his home page.
  await viewAs(page, demoStudent("tomasz"));
  await page.goto("/student");
  await expect(
    page.getByText(`Your academic year, ${LAST_YEAR}, has ended.`),
  ).toBeVisible();
});

test("moves a student on to this year, with its modules and fee", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff/progression");
  const row = page.getByRole("row", { name: /Tomasz Nowak/ });
  await expect(row).toContainText(`Year 1 · ${LAST_YEAR}`);
  const step = row.getByRole("combobox", {
    name: "Next step for Tomasz Nowak",
  });
  await expect(step).toHaveValue("next");
  // A choice made is kept, then changed back.
  await step.selectOption("repeat");
  await expect(page.getByText("You've changed 1 student's step")).toBeVisible();
  await step.selectOption("next");

  await page
    .getByRole("button", { name: `Move 1 student on to ${THIS_YEAR}` })
    .click();
  const dialog = page.getByRole("dialog", {
    name: `Move 1 student on to ${THIS_YEAR}?`,
  });
  await dialog.getByRole("button", { name: "Move them on" }).click();
  await expect(
    page.getByText(`Moved on to ${THIS_YEAR}: 1 student up a year.`),
  ).toBeVisible();
  await expect(
    page.getByText(`Every enrolled student is in ${THIS_YEAR} or later`),
  ).toBeVisible();

  // His record: year 2 this year, its core modules, and its fee to pay.
  await page.goto(`/staff/students/${demoStudent("tomasz")}?tab=fees`);
  await expect(page.getByText(`Year 2 · ${THIS_YEAR}`).first()).toBeVisible();
  await expect(page.getByText(`${LAST_YEAR} has ended`)).toBeHidden();
  await expect(
    page.getByRole("cell", { name: `Tuition fee ${THIS_YEAR}`, exact: false }),
  ).toBeVisible();
});
