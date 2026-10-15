// Choosing a view, and who may open which pages and files.
import { expect, test } from "@playwright/test";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

test("staff choose their view and land on the Registry dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as staff" }).click();

  await expect(page).toHaveURL("/staff");
  await expect(
    page.getByRole("heading", { level: 1, name: "Registry dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Viewing as Registry staff")).toBeVisible();
});

test("a student chooses their name and sees their own record", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Student").selectOption(demoStudent("priya"));
  await page.getByRole("button", { name: "Continue as student" }).click();

  await expect(page).toHaveURL("/student");
  await expect(
    page.getByRole("heading", { level: 1, name: "Priya Natarajan" }),
  ).toBeVisible();
});

test("staff pages send students and visitors back to choose a view", async ({
  page,
}) => {
  await page.goto("/staff/students");
  await expect(page).toHaveURL("/");

  await viewAs(page, demoStudent("priya"));
  await page.goto("/staff");
  await expect(page).toHaveURL("/");
});

test("students can download their own work, and nobody else's", async ({
  page,
}) => {
  await viewAs(page, "staff");
  const { assessments } = (await (
    await page.request.get("/api/assessments")
  ).json()) as { assessments: { id: string; title: string }[] };
  const proposal = assessments.find(
    ({ title }) => title === "Web project proposal",
  );
  const { assessment } = (await (
    await page.request.get(`/api/assessments/${proposal?.id ?? ""}`)
  ).json()) as {
    assessment: {
      students: { studentNumber: string; submission: { id: string } | null }[];
    };
  };
  const submission = assessment.students.find(
    ({ studentNumber }) => studentNumber === demoStudent("priya"),
  )?.submission;
  const url = `/api/submissions/${submission?.id ?? ""}/file`;

  await viewAs(page, demoStudent("oliver"));
  expect((await page.request.get(url)).status()).toBe(403);

  await viewAs(page, demoStudent("priya"));
  const own = await page.request.get(url);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");
});
