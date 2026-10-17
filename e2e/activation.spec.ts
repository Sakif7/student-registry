// A student's sign-in account: staff enrol the student, the activation email
// arrives (read from Mailpit), and the student chooses a password and signs
// in; or staff set the password at enrolment, and the student signs in at
// once. Staff can also turn a student's sign-in off, which signs them out.
import { expect, test } from "@playwright/test";

import { DEMO_PASSWORD } from "@/lib/demo-accounts";

import { demoStudent, loadDemoData, viewAs } from "./support/helpers";
import { clearInbox, latestEmailTo, linkIn } from "./support/mailpit";

test.beforeAll(loadDemoData);

const GRACE = "grace.thompson@student.example";
const PASSWORD = "grace-chooses-a-long-passphrase";

test("a newly enrolled student activates the account from the emailed link", async ({
  page,
  browser,
}) => {
  await clearInbox(GRACE);
  await viewAs(page, "staff");
  await page.goto("/staff/students/new");
  await page.getByLabel("Full name").fill("Grace Thompson");
  await page.getByLabel("Email").fill(GRACE);
  await page.getByLabel("Date of birth").fill("2005-03-12");
  await page.getByLabel("Programme").selectOption("BSC-CS");
  // The demo starts with a password set now; this journey is the email's.
  await page.getByRole("switch", { name: "Send an activation link" }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByRole("button", { name: "Enrol student" }).click();

  await expect(
    page.getByText(`An activation email went to ${GRACE}.`),
  ).toBeVisible();
  await expect(page.getByText("Waiting for activation")).toBeVisible();
  const email = await latestEmailTo(GRACE);
  expect(email.Subject).toBe("Activate your Student Registry account");

  // The student, in a browser of their own.
  const own = await browser.newContext();
  const student = await own.newPage();
  await student.goto(linkIn(email));
  await expect(student).toHaveURL(/\/activate\?token=\w+$/);
  await student.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await student.getByLabel("Type it again").fill(PASSWORD);
  await student.getByRole("button", { name: "Activate my account" }).click();
  await expect(student.getByText("Your account is ready")).toBeVisible();
  await student.getByRole("link", { name: "Sign in" }).click();
  await expect(
    student.getByRole("heading", { level: 1, name: "Sign in" }),
  ).toBeVisible();
  // The activation page stays in the document, hidden, with its own fields.
  await student.getByLabel("Email").filter({ visible: true }).fill(GRACE);
  await student
    .getByLabel("Password", { exact: true })
    .filter({ visible: true })
    .fill(PASSWORD);
  await student.getByRole("button", { name: "Sign in" }).click();
  await expect(student).toHaveURL("/student");
  await expect(
    student.getByRole("heading", { level: 1, name: "Grace Thompson" }),
  ).toBeVisible();
  await own.close();

  await page.reload();
  await page.getByRole("tab", { name: "Sign-in" }).click();
  await expect(page.getByText(/^Activated on /)).toBeVisible();
});

test("a student enrolled with a password set by staff can sign in at once", async ({
  page,
  browser,
}) => {
  const MAYA = "maya.ellis@student.example";
  await viewAs(page, "staff");
  await page.goto("/staff/students/new");
  await page.getByLabel("Full name").fill("Maya Ellis");
  await page.getByLabel("Email").fill(MAYA);
  await page.getByLabel("Date of birth").fill("2006-01-20");
  await page.getByLabel("Programme").selectOption("BA-BM");
  // In the demo, the password starts as the demo password.
  await expect(
    page.getByRole("switch", { name: "Send an activation link" }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Password")).toHaveValue(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Enrol student" }).click();

  await expect(
    page.getByText("They can sign in now, with the password you set."),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Active", { exact: true }),
  ).toBeVisible();

  const own = await browser.newContext();
  const student = await own.newPage();
  await student.goto("/login");
  await student.getByLabel("Email").fill(MAYA);
  await student.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await student.getByRole("button", { name: "Sign in" }).click();
  await expect(student).toHaveURL("/student");
  await expect(
    student.getByRole("heading", { level: 1, name: "Maya Ellis" }),
  ).toBeVisible();
  await own.close();
});

// Last in the file: it ends Priya's demo session, which viewAs relies on.
test("turning a student's sign-in off signs them out, even after Undo", async ({
  page,
  browser,
}) => {
  const own = await browser.newContext();
  const student = await own.newPage();
  await viewAs(student, demoStudent("priya"));
  await student.goto("/student");
  await expect(
    student.getByRole("heading", { level: 1, name: "Priya Natarajan" }),
  ).toBeVisible();

  await viewAs(page, "staff");
  await page.goto(`/staff/students/${demoStudent("priya")}?tab=sign-in`);
  // The Sign-in tab (the header shows the state too).
  const signIn = page.getByRole("tabpanel");
  await page.getByRole("button", { name: "Turn sign-in off" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Turn sign-in off" })
    .click();
  await expect(
    page.getByText("Sign-in turned off for Priya Natarajan."),
  ).toBeVisible();
  await expect(signIn.getByText("Turned off", { exact: true })).toBeVisible();

  // Undo lets Priya sign in again, but the sessions ended are gone for good.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText("Sign-in turned back on for Priya Natarajan."),
  ).toBeVisible();
  await expect(signIn.getByText("Active", { exact: true })).toBeVisible();
  await student.reload();
  await expect(student).toHaveURL("/login");
  await own.close();
});
