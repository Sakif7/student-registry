// Results: students see marks only once published, and none while their
// results are withheld.
import { expect, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

test("withheld results stay hidden until the hold is lifted", async ({
  page,
}) => {
  await viewAs(page, demoStudent("amelia"));
  await page.goto("/student/results");
  await expect(page.getByText("Your results are being withheld")).toBeVisible();
  await expect(page.getByText("Outstanding tuition fees")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);

  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("amelia")}?tab=results`);
  await page.getByRole("button", { name: "Lift the hold" }).click();
  await expect(
    page.getByRole("button", { name: "Withhold results" }),
  ).toBeVisible();

  await viewAs(page, demoStudent("amelia"));
  await page.goto("/student/results");
  const row = page.getByRole("row", { name: /Software design report/ });
  await expect(row.getByRole("cell", { name: "66" })).toBeVisible();
  await expect(row.getByRole("cell", { name: "Merit" })).toBeVisible();
});

test("publishing releases a student's marks, after a confirmation", async ({
  page,
}) => {
  await viewAs(page, demoStudent("chloe"));
  await page.goto("/student/results");
  await expect(page.getByText("No results yet.")).toBeVisible();

  await viewAs(page, "staff");
  await page.goto("/staff/results");
  await page
    .getByRole("button", { name: "Publish 1 mark to Chloé Dubois" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Publish 1 mark to Chloé Dubois?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Published 1 mark to Chloé Dubois."),
  ).toBeVisible();

  await viewAs(page, demoStudent("chloe"));
  await page.goto("/student/results");
  const row = page.getByRole("row", { name: /Management essay/ });
  await expect(row.getByRole("cell", { name: "62" })).toBeVisible();
});

test("staff withhold results for a reason of their own", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("kwame")}?tab=results`);
  await page.getByRole("button", { name: "Withhold results" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason", { exact: true }).selectOption("other");
  await dialog.getByRole("button", { name: "Withhold results" }).click();
  await expect(dialog.getByText("Give a reason")).toBeVisible();
  await dialog
    .getByLabel("Describe the reason")
    .fill("Awaiting an academic misconduct panel");
  await dialog.getByRole("button", { name: "Withhold results" }).click();
  await expect(page.getByText("Results withheld since")).toBeVisible();

  // Kwame's published Fail is hidden along with everything else.
  await viewAs(page, demoStudent("kwame"));
  await page.goto("/student/results");
  await expect(
    page.getByText("Awaiting an academic misconduct panel"),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("the results list opens a student's Results tab", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto("/staff/results");
  await page.getByRole("link", { name: "Kwame Mensah" }).click();

  await expect(page).toHaveURL(
    `/staff/students/${demoStudent("kwame")}?tab=results`,
  );
  await expect(
    page.getByRole("tab", { name: "Results", selected: true }),
  ).toBeVisible();
});
