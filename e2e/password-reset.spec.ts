// Forgetting a password: asking for a link, receiving it by email (read from
// Mailpit), and choosing a new password with it.
import { expect, type Page, test } from "@playwright/test";

import { loadDemoData } from "./support/helpers";
import { clearInbox, latestEmailTo, linkIn } from "./support/mailpit";

test.beforeAll(loadDemoData);

const AMELIA = "amelia.hart@student.example";
const NEW_PASSWORD = "a-brand-new-passphrase";

// Pages visited earlier stay in the document, hidden, so the sign-in page's
// "Email" field can still be there behind the forgot-password page's.
function emailField(page: Page) {
  return page.getByLabel("Email").filter({ visible: true });
}

test("a student resets a forgotten password from the emailed link", async ({
  page,
}) => {
  await clearInbox(AMELIA);
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  // Following a link renders the next page in place, so wait for it.
  await expect(
    page.getByRole("heading", { level: 1, name: "Forgot your password?" }),
  ).toBeVisible();
  await emailField(page).fill(AMELIA);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const email = await latestEmailTo(AMELIA);
  expect(email.Subject).toBe("Reset your Student Registry password");
  const link = linkIn(email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password\?token=\w+$/);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Type it again").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change my password" }).click();
  await expect(page.getByText("Your password has changed")).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in" }),
  ).toBeVisible();
  await emailField(page).fill(AMELIA);
  await page.getByLabel("Password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/student");

  // The link has done its job, so it no longer works.
  await page.goto(link);
  await expect(page.getByText("This link no longer works")).toBeVisible();
});

test("the two passwords must match", async ({ page }) => {
  await page.goto("/reset-password?token=unchecked-until-submitted");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Type it again").fill("something-else-entirely");
  await page.getByRole("button", { name: "Change my password" }).click();

  await expect(page.getByText("The passwords don't match")).toBeVisible();
});
