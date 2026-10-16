// The curriculum, as staff set it up: a module, its place in a programme,
// and the academic calendar.
import { expect, type Page, test } from "@playwright/test";

import { formatAcademicYear } from "@/domain/academic-year";

import { currentIntakeYear, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

const toasts = (page: Page) =>
  page.getByRole("region", { name: /^Notifications/ });

test("staff set up a module and make it an option in a programme", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff/modules");
  await page.getByRole("button", { name: "Set up a module" }).click();
  const setUp = page.getByRole("dialog", { name: "Set up a module" });
  await setUp.getByLabel("Code").fill("cs4006");
  await setUp.getByLabel("Title").fill("Ethical Hacking");
  await setUp.getByLabel("Credits").fill("12");
  await setUp.getByLabel("Taught in").selectOption("Semester 2");
  await setUp.getByRole("button", { name: "Set up module" }).click();
  await expect(setUp.getByText("Credits come in multiples of 5")).toBeVisible();
  await setUp.getByLabel("Credits").fill("15");
  await setUp.getByRole("button", { name: "Set up module" }).click();
  await expect(setUp).toBeHidden();
  await expect(
    page.getByRole("row", { name: /CS4006 Ethical Hacking/ }),
  ).toContainText("No programme yet");

  await page.goto("/staff/programmes/BSC-CS");
  await page.getByRole("button", { name: "Add a module" }).click();
  const add = page.getByRole("dialog", { name: "Add a module to BSC-CS" });
  await add.getByLabel("Module").selectOption("CS4006");
  await add.getByLabel("Year of study").selectOption("Year 1");
  await add.getByLabel("Core or optional").selectOption("Optional");
  await add.getByRole("button", { name: "Add module" }).click();
  await expect(add).toBeHidden();

  const yearOne = page.getByRole("table", { name: /in year 1/ });
  await expect(
    yearOne.getByRole("row", { name: /CS4006 Ethical Hacking/ }),
  ).toContainText("Optional");
  await expect(
    page
      .locator("[data-slot=card]")
      .filter({ has: page.getByRole("heading", { name: "Year 1" }) }),
  ).toContainText(
    "Core modules take 90 of the 120 credits. Students choose 30 more from 60 credits of options.",
  );

  // Removing it can be undone, back in the same year as the same kind.
  await yearOne.getByRole("button", { name: "Remove CS4006" }).click();
  await expect(yearOne.getByRole("row", { name: /CS4006/ })).toHaveCount(0);
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    yearOne.getByRole("row", { name: /CS4006 Ethical Hacking/ }),
  ).toContainText("Optional");
});

test("staff set up next academic year, and let students choose their options", async ({
  page,
}) => {
  const start = currentIntakeYear() + 1;
  const next = formatAcademicYear(start);
  await viewAs(page, "staff");
  await page.goto("/staff/academic-years");

  await page.getByRole("button", { name: `Set up ${next}` }).click();
  const dialog = page.getByRole("dialog", { name: `Set up ${next}` });
  await dialog.getByLabel("Semester 1 starts").fill(`${start}-09-20`);
  await dialog.getByLabel("Semester 1 ends").fill(`${start + 1}-01-21`);
  await dialog.getByLabel("Semester 2 starts").fill(`${start + 1}-01-14`);
  await dialog.getByLabel("Semester 2 ends").fill(`${start + 1}-06-09`);
  await dialog.getByRole("button", { name: "Set up" }).click();
  await expect(
    dialog.getByText("Start semester 2 after semester 1 ends"),
  ).toBeVisible();
  await dialog.getByLabel("Semester 2 starts").fill(`${start + 1}-01-31`);
  await dialog.getByRole("button", { name: "Set up" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: next })).toBeVisible();

  const current = formatAcademicYear(currentIntakeYear());
  const thisYear = page
    .locator("[data-slot=card]")
    .filter({ has: page.getByRole("heading", { name: current }) });
  await thisYear.getByRole("button", { name: "Let students choose" }).click();
  await expect(
    thisYear.getByText("Students choose their own optional modules."),
  ).toBeVisible();
  await toasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    thisYear.getByText("Only the Registry changes students' modules."),
  ).toBeVisible();
});
