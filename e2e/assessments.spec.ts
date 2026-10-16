// The assessment journey: staff set an assessment, a student submits and
// replaces work, late work is flagged, and staff enter marks.
import { expect, test } from "@playwright/test";

import { sampleDocx, samplePdf } from "../prisma/sample-documents";

import {
  deadlineInDays,
  demoStudent,
  loadDemoData,
  viewAs,
} from "./support/helpers";

// The tests build on each other, from setting the assessment to marking it.
test.describe.configure({ mode: "serial" });

test.beforeAll(loadDemoData);

const pdf = {
  name: "lab-test.pdf",
  mimeType: "application/pdf",
  buffer: samplePdf("SQL lab test", ["Priya Natarajan"]),
};

let assessmentUrl = "";

test("staff set an assessment, with the deadline in college time", async ({
  page,
}) => {
  await viewAs(page, "staff");
  await page.goto("/staff/assessments/new");
  await page.getByLabel("Module").selectOption("CS4002");
  await page.getByLabel("Title").fill("SQL lab test");

  // 01:30 on the last Sunday of March 2027 never happens in London.
  await page.getByLabel("Deadline").fill("2027-03-28T01:30");
  await page.getByRole("button", { name: "Set assessment" }).click();
  await expect(
    page.getByText("The clocks go forward at that time, so it never happens."),
  ).toBeVisible();

  await page.getByLabel("Deadline").fill(deadlineInDays(28));
  await page.getByRole("button", { name: "Set assessment" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "SQL lab test" }),
  ).toBeVisible();
  await expect(page.getByText(/17:00 (GMT|BST)/)).toBeVisible();
  await expect(
    // Oliver and Priya: the first-years registered on CS4002.
    page.getByText("0 of 2 registered students have submitted."),
  ).toBeVisible();
  assessmentUrl = new URL(page.url()).pathname;
});

test("a student submits work, and replaces it before the deadline", async ({
  page,
}) => {
  await viewAs(page, demoStudent("priya"));
  await page.goto("/student/assessments");
  await page.getByRole("link", { name: "SQL lab test" }).click();

  // A web page renamed .pdf is refused by the server's content check.
  await page.getByLabel("Your work").setInputFiles({
    name: "essay.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html><body>Not a PDF</body></html>"),
  });
  await page.getByRole("button", { name: "Submit my work" }).click();
  // Shown under the field (and repeated in a toast).
  await expect(
    page
      .locator("form")
      .getByText(
        "This file isn't a valid PDF or Word document, whatever its name says",
      ),
  ).toBeVisible();

  await page.getByLabel("Your work").setInputFiles(pdf);
  await page.getByRole("button", { name: "Submit my work" }).click();
  await expect(page.getByRole("link", { name: /lab-test\.pdf/ })).toBeVisible();

  await page.getByLabel("New file").setInputFiles({
    name: "lab-test-v2.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: sampleDocx("SQL lab test", ["Second version"]),
  });
  await page.getByRole("button", { name: "Replace my work" }).click();
  await expect(
    page.getByRole("link", { name: /lab-test-v2\.docx/ }),
  ).toBeVisible();
  await expect(page.getByText("This is your 2nd upload.")).toBeVisible();
});

test("work submitted after the deadline is accepted but marked late", async ({
  page,
}) => {
  await viewAs(page, demoStudent("priya"));
  await page.goto("/student/assessments");
  await page.getByRole("link", { name: "Database design report" }).click();
  await expect(page.getByText("The deadline has passed").first()).toBeVisible();

  await page.getByLabel("Your work").setInputFiles(pdf);
  await page.getByRole("button", { name: "Submit my work" }).click();

  // Next.js keeps the previous page mounted but hidden, so only count what
  // is visible.
  await expect(
    page.getByText("Late", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Replace my work" }),
  ).toHaveCount(0);
});

test("staff see the submission and enter marks", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto(assessmentUrl);
  await expect(
    page.getByText("1 of 2 registered students have submitted."),
  ).toBeVisible();
  await expect(page.getByText("Replaced 1 time")).toBeVisible();

  await page.getByLabel("Mark for Priya Natarajan").fill("64");
  await expect(
    page.getByRole("row", { name: /Priya Natarajan/ }),
  ).toContainText("Merit");
  await page.getByLabel("Mark for Oliver Bennett").fill("101");
  await page.getByRole("button", { name: "Save marks" }).click();
  await expect(
    page.getByText("Enter a whole number from 0 to 100"),
  ).toHaveCount(0);
  await expect(page.getByText("Marks run from 0 to 100")).toBeVisible();

  await page.getByLabel("Mark for Oliver Bennett").fill("");
  await page.getByRole("button", { name: "Save marks" }).click();
  await expect(page.getByText("Saved 1 mark.")).toBeVisible();
  await expect(page.getByText("Not published")).toBeVisible();
});

test("staff sort the assessments by a column, either way", async ({ page }) => {
  await viewAs(page, "staff");
  await page.goto("/staff/assessments");
  const first = page.getByRole("row").nth(1).getByRole("link");
  // Open ones first, soonest deadline first.
  await expect(first).toHaveText("Systems lab report");

  await page.getByRole("link", { name: "Module", exact: true }).click();
  await expect(page).toHaveURL("/staff/assessments?sort=module&dir=asc");
  await expect(
    page.getByRole("columnheader", { name: "Module" }),
  ).toHaveAttribute("aria-sort", "ascending");
  // BM4001 comes first.
  await expect(first).toHaveText("Management essay");

  await page.getByRole("link", { name: "Module", exact: true }).click();
  await expect(page).toHaveURL("/staff/assessments?sort=module&dir=desc");
  // DS7002 comes first.
  await expect(first).toHaveText("Data pipeline design");
});
