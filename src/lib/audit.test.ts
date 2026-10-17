import { describe, expect, it } from "vitest";

import { describeEvent } from "./audit";

const SQL = { assessmentId: "a1", title: "SQL lab test" };

describe("describeEvent", () => {
  it.each([
    [
      "student.enrolled",
      { studentNumber: "SMS-2026-0008", status: "ENROLLED" },
      "Enrolled as SMS-2026-0008, Enrolled",
    ],
    ["student.edited", { fields: ["email"] }, "Edited the email address"],
    [
      "student.edited",
      { fields: ["fullName", "email", "academicYear"] },
      "Edited the name, email address and academic year",
    ],
    [
      "student.status_changed",
      { from: "ENROLLED", to: "DEFERRED", reason: "Medical grounds" },
      "Changed the status from Enrolled to Deferred: Medical grounds",
    ],
    [
      "student.status_changed",
      { from: "DEFERRED", to: "ENROLLED", reason: null },
      "Changed the status from Deferred to Enrolled",
    ],
    [
      "fee.charged",
      { academicYear: "2026/27", amountPence: 953_500 },
      "Charged the 2026/27 fee of £9,535.00",
    ],
    [
      "fee.corrected",
      { academicYear: "2026/27", amountPence: 0, dueDate: "2026-11-30" },
      "Corrected the 2026/27 fee to £0.00, due 30 Nov 2026",
    ],
    [
      "fee.corrected",
      {
        academicYear: "2026/27",
        amountPence: 0,
        dueDate: "2026-11-30",
        from: { amountPence: 953_500, dueDate: "2026-10-01" },
        note: "Full scholarship",
      },
      "Corrected the 2026/27 fee from £9,535.00, due 1 Oct 2026, to £0.00, due 30 Nov 2026: Full scholarship",
    ],
    [
      "payment.recorded",
      { amountPence: 50_000, reference: "BACS 0042" },
      "Recorded a payment of £500.00 (BACS 0042)",
    ],
    [
      "payment.reversed",
      {
        amountPence: 50_000,
        reference: "BACS 0042",
        reason: "Keyed against the wrong student",
      },
      "Reversed the payment of £500.00 (BACS 0042): Keyed against the wrong student",
    ],
    [
      "assessment.set",
      { ...SQL, moduleCode: "CS4002" },
      "Set the assessment “SQL lab test” for CS4002",
    ],
    ["assessment.edited", SQL, "Edited the assessment “SQL lab test”"],
    ["assessment.closed", SQL, "Closed “SQL lab test” to submissions"],
    ["assessment.reopened", SQL, "Reopened “SQL lab test” to submissions"],
    [
      "mark.saved",
      { ...SQL, from: null, to: 72 },
      "Entered a mark of 72 for “SQL lab test”",
    ],
    [
      "mark.saved",
      { ...SQL, from: 72, to: 68 },
      "Changed the mark for “SQL lab test” from 72 to 68",
    ],
    [
      "mark.saved",
      { ...SQL, from: 72, to: null },
      "Removed the mark of 72 for “SQL lab test”",
    ],
    ["results.published", { marks: 1 }, "Published 1 mark"],
    ["results.published", { marks: 3 }, "Published 3 marks"],
    [
      "results.withheld",
      { reason: "Outstanding tuition fees" },
      "Withheld the results: Outstanding tuition fees",
    ],
    ["results.hold_lifted", {}, "Lifted the hold on the results"],
    [
      "work.submitted",
      { ...SQL, fileName: "essay.pdf", late: false, attempt: 1 },
      "Submitted work for “SQL lab test”: essay.pdf",
    ],
    [
      "work.submitted",
      { ...SQL, fileName: "essay-v2.docx", late: true, attempt: 2 },
      "Replaced the work for “SQL lab test”: essay-v2.docx, late",
    ],
    [
      "sign_in.link_sent",
      { kind: "activation" },
      "Emailed a link to activate the account",
    ],
    ["sign_in.link_sent", { kind: "reset" }, "Emailed a password reset link"],
    ["sign_in.password_set", {}, "Set a password for the account"],
    ["sign_in.turned_off", {}, "Turned sign-in off"],
    ["sign_in.turned_on", {}, "Turned sign-in back on"],
    ["student.edited", { fields: ["yearOfStudy"] }, "Edited the year of study"],
    [
      "programme.created",
      { code: "BSC-CS", title: "BSc (Hons) Computer Science" },
      "Set up the programme BSC-CS BSc (Hons) Computer Science",
    ],
    [
      "programme.edited",
      { code: "BSC-CS", fields: ["annualFeePence", "creditsPerYear"] },
      "Edited BSC-CS’s annual fee and credits per year",
    ],
    [
      "programme.module_added",
      {
        code: "BSC-CS",
        moduleCode: "AI4001",
        yearOfStudy: 1,
        kind: "OPTIONAL",
      },
      "Added AI4001 to BSC-CS, year 1, as optional",
    ],
    [
      "programme.module_removed",
      { code: "BSC-CS", moduleCode: "AI4001" },
      "Removed AI4001 from BSC-CS",
    ],
    [
      "module.created",
      { code: "CS4002", title: "Databases" },
      "Set up the module CS4002 Databases",
    ],
    [
      "module.edited",
      { code: "CS4002", fields: ["semester"] },
      "Edited CS4002’s semester",
    ],
    [
      "academic_year.saved",
      { year: "2027/28", created: true, studentsChooseModules: false },
      "Set up 2027/28’s semesters; students may not choose their optional modules",
    ],
    [
      "academic_year.saved",
      { year: "2026/27", created: false, studentsChooseModules: true },
      "Changed 2026/27’s semesters; students may choose their optional modules",
    ],
    [
      "academic_year.choosing_changed",
      { year: "2026/27", studentsChooseModules: true },
      "Let students choose their optional modules for 2026/27",
    ],
    [
      "academic_year.choosing_changed",
      { year: "2026/27", studentsChooseModules: false },
      "Stopped students choosing their optional modules for 2026/27",
    ],
    [
      "registration.added",
      {
        moduleCode: "CS4004",
        moduleTitle: "Mathematics for Computing",
        academicYear: "2026/27",
      },
      "Registered on CS4004 Mathematics for Computing for 2026/27",
    ],
    [
      "registration.dropped",
      {
        moduleCode: "CS4004",
        moduleTitle: "Mathematics for Computing",
        academicYear: "2026/27",
      },
      "Dropped CS4004 Mathematics for Computing for 2026/27",
    ],
  ])("describes %s", (action, details, sentence) => {
    expect(describeEvent(action, details)).toBe(sentence);
  });

  it("shows an action it doesn't know as it is", () => {
    expect(describeEvent("timetable.published", {})).toBe(
      "timetable.published",
    );
  });
});
