import { describe, expect, it } from "vitest";

import {
  canEnterMarks,
  classify,
  countByClassification,
  filterResultsStudents,
  filterStudentResults,
  isVisibleToStudent,
  markFieldSchema,
  markSchema,
  marksheetSchema,
  resultsListSchema,
  studentResultsListSchema,
  withholdResultsSchema,
} from "./results";

describe("classify", () => {
  it.each([
    [0, "FAIL"],
    [39, "FAIL"],
    [40, "PASS"],
    [59, "PASS"],
    [60, "MERIT"],
    [69, "MERIT"],
    [70, "DISTINCTION"],
    [100, "DISTINCTION"],
  ])("classifies %i as %s", (mark, classification) => {
    expect(classify(mark)).toBe(classification);
  });
});

describe("countByClassification", () => {
  it("counts the marks in each classification, including those with none", () => {
    expect(countByClassification([35, 40, 59, 74, 81])).toEqual({
      FAIL: 1,
      PASS: 2,
      MERIT: 0,
      DISTINCTION: 2,
    });
  });
});

describe("markSchema", () => {
  it.each([0, 40, 100])("accepts %i", (mark) => {
    expect(markSchema.parse({ mark })).toEqual({ mark });
  });

  it.each([
    [-1, "Marks run from 0 to 100"],
    [101, "Marks run from 0 to 100"],
    [62.5, "Marks are whole numbers"],
    [Number.NaN, "Enter a mark from 0 to 100"],
  ])("rejects %s", (mark, message) => {
    expect(markSchema.safeParse({ mark }).error?.issues[0]?.message).toBe(
      message,
    );
  });

  it("rejects a mark sent as text", () => {
    expect(markSchema.safeParse({ mark: "65" }).success).toBe(false);
  });
});

describe("withholdResultsSchema", () => {
  it("requires a reason", () => {
    expect(
      withholdResultsSchema.safeParse({ reason: " " }).error?.issues[0]
        ?.message,
    ).toBe("Give a reason");
  });
});

describe("canEnterMarks", () => {
  const deadline = new Date("2026-11-20T17:00:00.000Z");

  it("waits for the deadline, while work can still change", () => {
    expect(canEnterMarks({ deadline, closedAt: null }, deadline)).toBe(false);
    expect(
      canEnterMarks(
        { deadline, closedAt: null },
        new Date("2026-11-20T17:00:01.000Z"),
      ),
    ).toBe(true);
  });

  it("allows marking once staff close the assessment, deadline or not", () => {
    const closedAt = new Date("2026-11-01T09:00:00.000Z");
    expect(canEnterMarks({ deadline, closedAt }, closedAt)).toBe(true);
  });
});

describe("isVisibleToStudent", () => {
  const published = { publishedAt: new Date("2026-10-01T09:00:00Z") };
  const unpublished = { publishedAt: null };

  it("shows a published result", () => {
    expect(isVisibleToStudent(published, false)).toBe(true);
  });

  it("hides an unpublished result", () => {
    expect(isVisibleToStudent(unpublished, false)).toBe(false);
  });

  it("hides even published results while results are withheld", () => {
    expect(isVisibleToStudent(published, true)).toBe(false);
  });
});

describe("marksheetSchema", () => {
  it("takes marks keyed by student ID, and null to remove one", () => {
    expect(
      marksheetSchema.parse({
        marks: { "sms-2025-0001": 72, "SMS-2026-0001": null },
      }),
    ).toEqual({ marks: { "SMS-2025-0001": 72, "SMS-2026-0001": null } });
  });

  it("explains a bad mark next to the student it belongs to", () => {
    const issue = marksheetSchema.safeParse({
      marks: { "SMS-2025-0001": 101 },
    }).error?.issues[0];
    expect(issue?.path).toEqual(["marks", "SMS-2025-0001"]);
    expect(issue?.message).toBe("Marks run from 0 to 100");
  });

  it("needs at least one mark, for real student IDs", () => {
    expect(
      marksheetSchema.safeParse({ marks: {} }).error?.issues[0]?.message,
    ).toBe("There are no marks to save");
    expect(
      marksheetSchema.safeParse({ marks: { amelia: 60 } }).error?.issues[0]
        ?.message,
    ).toBe("Not a student ID");
  });
});

describe("markFieldSchema", () => {
  it("reads a blank field as no mark and digits as a mark", () => {
    expect(markFieldSchema.parse("")).toBeNull();
    expect(markFieldSchema.parse(" 72 ")).toBe(72);
  });

  it.each([
    ["72.5", "Enter a whole number from 0 to 100"],
    ["-3", "Enter a whole number from 0 to 100"],
    ["abc", "Enter a whole number from 0 to 100"],
    ["101", "Marks run from 0 to 100"],
  ])("rejects %j", (text, message) => {
    expect(markFieldSchema.safeParse(text).error?.issues[0]?.message).toBe(
      message,
    );
  });
});

describe("filterResultsStudents", () => {
  const student = (
    fullName: string,
    publishedCount: number,
    unpublishedCount: number,
    withheld = false,
  ) => ({
    fullName,
    studentNumber: `SMS-2026-000${fullName.length}`,
    publishedCount,
    unpublishedCount,
    withheld: withheld ? { reason: "Outstanding tuition fees" } : null,
  });
  const students = [
    student("Oliver Bennett", 1, 1),
    student("Amelia Hart", 1, 0, true),
    student("Kwame Mensah", 2, 0),
    student("Chloé Dubois", 0, 1, true),
  ];
  const names = (list: readonly { fullName: string }[]) =>
    list.map(({ fullName }) => fullName);

  it("lists those with marks to publish, withheld, or all published", () => {
    expect(names(filterResultsStudents(students, { show: "publish" }))).toEqual(
      ["Oliver Bennett"],
    );
    expect(
      names(filterResultsStudents(students, { show: "withheld" })),
    ).toEqual(["Amelia Hart", "Chloé Dubois"]);
    expect(
      names(filterResultsStudents(students, { show: "published" })),
    ).toEqual(["Kwame Mensah"]);
  });

  it("searches names and student IDs, with or without a filter", () => {
    expect(
      names(filterResultsStudents(students, { q: "chloe\u0301" })),
    ).toEqual(["Chloé Dubois"]);
    expect(
      names(filterResultsStudents(students, { q: "hart", show: "publish" })),
    ).toEqual([]);
    expect(filterResultsStudents(students, {})).toHaveLength(4);
  });

  it("reads the page's two lists from the URL, ignoring what it can't use", () => {
    expect(
      resultsListSchema.parse({
        aq: "lab",
        apage: "2",
        q: "oliver",
        show: "publish",
        page: "3",
      }),
    ).toEqual({ aq: "lab", apage: 2, q: "oliver", show: "publish", page: 3 });
    expect(resultsListSchema.parse({ show: "all", page: "-1" })).toMatchObject({
      show: undefined,
      page: undefined,
    });
  });
});

describe("filterStudentResults", () => {
  const result = (
    title: string,
    moduleCode: string,
    classification: "FAIL" | "PASS" | "MERIT" | "DISTINCTION",
  ) => ({
    assessment: { title },
    module: { code: moduleCode, title: "Module" },
    classification,
  });
  const results = [
    result("SQL lab test", "CS4002", "DISTINCTION"),
    result("Design report", "CS4002", "MERIT"),
    result("Essay", "BM4001", "MERIT"),
  ];
  const titles = (list: readonly { assessment: { title: string } }[]) =>
    list.map(({ assessment }) => assessment.title);

  it("searches assessments and modules, and narrows to a classification", () => {
    expect(titles(filterStudentResults(results, { q: "cs4002" }))).toEqual([
      "SQL lab test",
      "Design report",
    ]);
    expect(titles(filterStudentResults(results, { result: "MERIT" }))).toEqual([
      "Design report",
      "Essay",
    ]);
    expect(
      titles(filterStudentResults(results, { q: "essay", result: "MERIT" })),
    ).toEqual(["Essay"]);
  });

  it("reads its settings from the URL, ignoring what it can't use", () => {
    expect(
      studentResultsListSchema.parse({ q: "lab", result: "PASS", page: "2" }),
    ).toEqual({ q: "lab", result: "PASS", page: 2 });
    expect(studentResultsListSchema.parse({ result: "A*" })).toMatchObject({
      result: undefined,
    });
  });
});
