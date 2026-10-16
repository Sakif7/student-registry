// Search from anywhere, with Ctrl/⌘+K or the button in the top bar: students
// by name or ID, pages and actions.
import { expect, type Page, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

/** Opens the search with the keyboard, once the page can hear it. */
async function openSearch(page: Page) {
  await expect(page.getByRole("button", { name: /^Search…/ })).toBeEnabled();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search" });
  await expect(search).toBeVisible();
  return search;
}

test("staff find a student by name and open their record", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto("/staff");
  const search = await openSearch(page);

  await search.getByRole("combobox").fill("kwame");
  await search.getByRole("option", { name: /Kwame Mensah/ }).click();

  await expect(page).toHaveURL(`/staff/students/${demoStudent("kwame")}`);
});

test("staff find a student by ID, and actions by name", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto("/staff/students");
  let search = await openSearch(page);
  await search.getByRole("combobox").fill(demoStudent("sofia").slice(-6));
  await expect(
    search.getByRole("option", { name: /Sofia Rossi/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Search…/ }).click();
  search = page.getByRole("dialog", { name: "Search" });
  await search.getByRole("combobox").fill("enrol");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/staff/students/new");
});

test("students search their own pages, and nothing of staff's", async ({
  page,
}) => {
  await viewAs(page, demoStudent("priya"));
  await page.goto("/student");
  const search = await openSearch(page);

  await search.getByRole("combobox").fill("enrol");
  await expect(search.getByText("Nothing matches “enrol”.")).toBeVisible();
  await search.getByRole("combobox").fill("results");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/student/results");
});
