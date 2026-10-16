// Who may open which pages and files. Every page and API route checks the
// session itself; the sign-in redirect in front of them is only a shortcut.
import { expect, test } from "@playwright/test";

import { SESSION_COOKIE } from "../tests/helpers/session-cookie";

import { E2E_PORT } from "./support/env";
import { demoStudent, loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

test("visitors who aren't signed in are sent to sign in first", async ({
  page,
}) => {
  await page.goto("/staff/students?status=ENROLLED");
  await expect(page).toHaveURL(
    "/login?next=%2Fstaff%2Fstudents%3Fstatus%3DENROLLED",
  );
});

test("a forged session cookie gets nowhere", async ({ page }) => {
  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: "forged-token.forged-signature",
      url: `http://localhost:${E2E_PORT}`,
    },
  ]);

  await page.goto("/staff");
  await expect(page).toHaveURL("/login");
  expect((await page.request.get("/api/students")).status()).toBe(401);
});

test("staff and students each stay in their own pages", async ({ page }) => {
  await viewAs(page, demoStudent("priya"));
  await page.goto("/staff");
  await expect(page).toHaveURL("/student");

  await viewAs(page, "staff");
  await page.goto("/student/results");
  await expect(page).toHaveURL("/staff");
});

test("the sign-in page sends someone already signed in on their way", async ({
  page,
}) => {
  await viewAs(page, demoStudent("priya"));
  await page.goto("/login");
  await expect(page).toHaveURL("/student");
});

test("students can download their own work, and nobody else's", async ({
  page,
}) => {
  await viewAs(page, "staff");
  const { assessments } = (await (
    await page.request.get("/api/assessments")
  ).json()) as { assessments: { id: string; title: string }[] };
  const report = assessments.find(
    ({ title }) => title === "Systems lab report",
  );
  const { assessment } = (await (
    await page.request.get(`/api/assessments/${report?.id ?? ""}`)
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
