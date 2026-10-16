// Signing in and out through the sign-in page.
import { expect, test } from "@playwright/test";

import { DEMO_PASSWORD } from "@/lib/demo-accounts";

import { SESSION_COOKIE } from "../tests/helpers/session-cookie";

import { loadDemoData } from "./support/helpers";

test.beforeAll(loadDemoData);

test("staff sign in with a demo account and land on the dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await page.getByRole("button", { name: "Use Jane Okafor" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/staff");
  await expect(
    page.getByRole("heading", { level: 1, name: "Registry dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("Jane Okafor")).toBeVisible();
});

test("a student signs in and goes on to the page they asked for", async ({
  page,
}) => {
  await page.goto("/student/results");
  await expect(page).toHaveURL("/login?next=%2Fstudent%2Fresults");
  await page.getByLabel("Email").fill("amelia.hart@student.example");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/student/results");
  await expect(
    page.getByRole("heading", { level: 1, name: "My results" }),
  ).toBeVisible();
});

test("a wrong password is refused without saying which part was wrong", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("jane.okafor@college.example");
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByText("The email address or password is incorrect."),
  ).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test("an account with sign-in turned off can't sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("hannah.kowalski@student.example");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByText(
      "Sign-in is turned off for this account. Contact the Registry.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test("signing out ends the session on the server, not just in the browser", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use Tom Reid" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/staff");
  const session = (await page.context().cookies()).find(
    ({ name }) => name === SESSION_COOKIE,
  );
  const withOldCookie = {
    headers: { cookie: `${SESSION_COOKIE}=${session?.value ?? ""}` },
  };
  expect((await request.get("/api/students", withOldCookie)).status()).toBe(
    200,
  );

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL("/login");
  expect((await request.get("/api/students", withOldCookie)).status()).toBe(
    401,
  );
  await page.goto("/staff");
  await expect(page).toHaveURL("/login?next=%2Fstaff");
});
