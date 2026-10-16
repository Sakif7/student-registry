// The Registry dashboard: its worklists lead to the work and clear once it is
// done, and its chart of students leads to the students it counts.
import { expect, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

test("a worklist leads to the work, and clears once it is done", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff");
  const toPublish = page.getByRole("region", { name: "Marks to publish" });
  // Longest waiting first.
  await expect(toPublish.getByRole("listitem")).toHaveText([
    /^Chloé Dubois/,
    /^Arjun Mehta/,
    /^Oliver Bennett/,
  ]);

  await toPublish.getByRole("link", { name: "Oliver Bennett" }).click();
  await expect(page).toHaveURL(
    `/staff/students/${demoStudent("oliver")}?tab=results`,
  );
  await page
    .getByRole("button", { name: "Publish 1 mark to Oliver Bennett" })
    .click();
  await page
    .getByRole("dialog", { name: "Publish 1 mark to Oliver Bennett?" })
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  await expect(
    page.getByText("Published 1 mark to Oliver Bennett."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(toPublish.getByRole("listitem")).toHaveText([
    /^Chloé Dubois/,
    /^Arjun Mehta/,
  ]);
});

test("the worklists and charts lead to the students and assessments", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff");

  const activation = page.getByRole("region", {
    name: "Waiting for activation",
  });
  await expect(activation.getByRole("listitem")).toHaveText([
    /^Arjun Mehta\s*Needs a new link$/,
  ]);
  await activation.getByRole("link", { name: "Arjun Mehta" }).click();
  await expect(page).toHaveURL(
    `/staff/students/${demoStudent("arjun")}?tab=sign-in`,
  );
  await expect(
    page.getByRole("tab", { name: "Sign-in", selected: true }),
  ).toBeVisible();

  await page.goto("/staff");
  const pastDeadline = page.getByRole("region", { name: "Past the deadline" });
  await pastDeadline.getByRole("link", { name: "Management essay" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Management essay" }),
  ).toBeVisible();

  await page.goto("/staff");
  const programmes = page.getByRole("region", {
    name: "Students by programme",
  });
  await expect(
    programmes.getByRole("listitem").filter({ hasText: "MSc Data Science" }),
  ).toContainText("2 enrolled · 1 withdrawn");
  await programmes.getByRole("link", { name: "Deferred 1" }).click();
  await expect(page).toHaveURL("/staff/students?status=DEFERRED");
  await expect(page.getByRole("link", { name: "Sofia Rossi" })).toBeVisible();
});
