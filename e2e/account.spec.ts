// The account page: changing one's password, and the devices one is signed
// in on.
import { expect, type Page, test } from "@playwright/test";

import { DEMO_PASSWORD } from "@/lib/demo-accounts";

import { loadDemoData, viewAs } from "./support/helpers";

test.beforeAll(loadDemoData);

const TOM = "tom.reid@college.example";
const NEW_PASSWORD = "tom-chooses-a-new-passphrase";

async function signInAsTom(page: Page, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TOM);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/staff");
}

test("changing one's password signs out the other devices", async ({
  page,
  browser,
}) => {
  const elsewhere = await browser.newContext();
  const otherDevice = await elsewhere.newPage();
  await signInAsTom(otherDevice, DEMO_PASSWORD);
  await signInAsTom(page, DEMO_PASSWORD);

  await page.getByRole("link", { name: "Tom Reid" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Your account" }),
  ).toBeVisible();
  const devices = page.getByRole("listitem").filter({ hasText: "Signed in" });
  await expect(devices).toHaveCount(2);
  await expect(devices.filter({ hasText: "This device" })).toHaveCount(1);

  await page.getByLabel("Current password").fill(DEMO_PASSWORD);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Type it again").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page.getByText("Signed out on 1 other device.")).toBeVisible();
  await expect(devices).toHaveCount(1);
  await otherDevice.reload();
  await expect(otherDevice).toHaveURL("/login");
  await elsewhere.close();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await signInAsTom(page, NEW_PASSWORD);
});

test("a wrong current password is refused beside the field", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff/account");

  await page.getByLabel("Current password").fill("not-the-password");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Type it again").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(
    page.getByText("That isn't your current password"),
  ).toBeVisible();
});
