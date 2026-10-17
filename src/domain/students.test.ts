import { describe, expect, it } from "vitest";

import {
  ageOn,
  changeStatusSchema,
  createStudentSchema,
  studentFiltersSchema,
  updateStudentSchema,
} from "./students";

const TODAY = "2026-10-15";

const valid = {
  fullName: "Amelia Hart",
  email: "amelia.hart@example.ac.uk",
  dateOfBirth: "2004-05-17",
  programmeCode: "BSC-CS",
  academicYear: "2026/27",
};

/** The first error message for a field, or undefined if it is valid. */
function errorFor(input: unknown, field: string) {
  const result = createStudentSchema(TODAY).safeParse(input);
  return result.error?.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("ageOn", () => {
  it("counts a birthday on the day itself", () => {
    expect(ageOn("2010-10-15", "2026-10-15")).toBe(16);
    expect(ageOn("2010-10-16", "2026-10-15")).toBe(15);
  });

  it("counts a 29 February birthday from 1 March in other years", () => {
    expect(ageOn("2008-02-29", "2025-02-28")).toBe(16);
    expect(ageOn("2008-02-29", "2025-03-01")).toBe(17);
    expect(ageOn("2008-02-29", "2028-02-29")).toBe(20);
  });
});

describe("createStudentSchema", () => {
  it("accepts a valid record and starts it as Enrolled, in year 1, by default", () => {
    expect(createStudentSchema(TODAY).parse(valid)).toEqual({
      ...valid,
      yearOfStudy: 1,
      status: "ENROLLED",
    });
  });

  it("takes a first password set by staff, if it is long enough", () => {
    expect(
      createStudentSchema(TODAY).parse({
        ...valid,
        password: "a-long-first-password",
      }),
    ).toMatchObject({ password: "a-long-first-password" });
    expect(errorFor({ ...valid, password: "too-short" }, "password")).toBe(
      "Use at least 12 characters",
    );
  });

  it("takes a year of study, as a number or as a form sends it", () => {
    expect(
      createStudentSchema(TODAY).parse({ ...valid, yearOfStudy: "2" }),
    ).toMatchObject({ yearOfStudy: 2 });
    expect(
      createStudentSchema(TODAY).safeParse({ ...valid, yearOfStudy: 0 }).error
        ?.issues[0]?.message,
    ).toBe("Choose a year of study");
  });

  it("asks for each empty field by name, rather than calling it invalid", () => {
    const empty = { ...valid, fullName: " ", email: "", dateOfBirth: "" };
    expect(errorFor(empty, "fullName")).toBe("Enter the student's full name");
    expect(errorFor(empty, "email")).toBe("Enter an email address");
    expect(errorFor(empty, "dateOfBirth")).toBe("Enter a date of birth");
    expect(errorFor({ ...valid, fullName: "A" }, "fullName")).toBe(
      "Enter at least 2 characters",
    );
  });

  it("normalises the email and the spacing of the name", () => {
    const parsed = createStudentSchema(TODAY).parse({
      ...valid,
      fullName: "  Amelia   Hart ",
      email: " Amelia.Hart@Example.AC.UK ",
    });
    expect(parsed.fullName).toBe("Amelia Hart");
    expect(parsed.email).toBe("amelia.hart@example.ac.uk");
  });

  it("stores accented letters in one form, however they were typed", () => {
    // "e" followed by a combining acute accent, as some keyboards send it.
    const parsed = createStudentSchema(TODAY).parse({
      ...valid,
      fullName: "Chloé Dubois",
    });
    expect(parsed.fullName).toBe("Chloé Dubois");
  });

  it.each([
    "Seán Ó Briain",
    "Mary-Jane O'Neil",
    "Mary-Jane O’Neil",
    "Nguyễn Văn An",
    "J. R. Smith",
  ])("accepts the name %j", (fullName) => {
    expect(errorFor({ ...valid, fullName }, "fullName")).toBeUndefined();
  });

  it.each([
    ["A", "Enter at least 2 characters"],
    [
      "Amelia2",
      "Use letters, spaces, hyphens, apostrophes and full stops only",
    ],
    [
      "<script>",
      "Use letters, spaces, hyphens, apostrophes and full stops only",
    ],
    [
      "-Amelia",
      "Use letters, spaces, hyphens, apostrophes and full stops only",
    ],
  ])("rejects the name %j", (fullName, message) => {
    expect(errorFor({ ...valid, fullName }, "fullName")).toBe(message);
  });

  it("rejects an invalid email", () => {
    expect(errorFor({ ...valid, email: "amelia.hart" }, "email")).toBe(
      "Enter a valid email address",
    );
  });

  it.each([
    ["2004-02-30", "Enter a real date, e.g. 2004-05-17"],
    ["2026-10-15", "The date of birth must be in the past"],
    ["2030-01-01", "The date of birth must be in the past"],
    ["2010-10-16", "Students must be at least 16"],
    ["1920-01-01", "Check the year: that makes the student over 100"],
  ])("rejects the date of birth %s", (dateOfBirth, message) => {
    expect(errorFor({ ...valid, dateOfBirth }, "dateOfBirth")).toBe(message);
  });

  it("accepts a student who turns 16 today", () => {
    expect(
      errorFor({ ...valid, dateOfBirth: "2010-10-15" }, "dateOfBirth"),
    ).toBeUndefined();
  });

  it("allows a deferred entry but not a withdrawn or completed new record", () => {
    expect(
      errorFor({ ...valid, status: "DEFERRED" }, "status"),
    ).toBeUndefined();
    expect(errorFor({ ...valid, status: "COMPLETED" }, "status")).toBe(
      "A new record starts as Enrolled or Deferred",
    );
  });

  it("reports every missing field", () => {
    const result = createStudentSchema(TODAY).safeParse({});
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      "fullName",
      "email",
      "dateOfBirth",
      "programmeCode",
      "academicYear",
    ]);
  });
});

describe("updateStudentSchema", () => {
  it("accepts a single changed field", () => {
    expect(
      updateStudentSchema(TODAY).parse({ academicYear: "2027/28" }),
    ).toEqual({ academicYear: "2027/28" });
  });

  it("rejects an empty update", () => {
    expect(
      updateStudentSchema(TODAY).safeParse({}).error?.issues[0]?.message,
    ).toBe("Nothing to update");
  });
});

describe("changeStatusSchema", () => {
  it("requires a reason for withdrawal", () => {
    const result = changeStatusSchema.safeParse({
      status: "WITHDRAWN",
      reason: "  ",
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["reason"],
      message: "Give a reason for deferral or withdrawal",
    });
  });

  it("does not need a reason to complete", () => {
    expect(changeStatusSchema.parse({ status: "COMPLETED" })).toEqual({
      status: "COMPLETED",
      reason: undefined,
    });
  });
});

describe("studentFiltersSchema", () => {
  it("reads filters from URL parameters", () => {
    expect(
      studentFiltersSchema.parse({
        q: " hart ",
        programme: "BSC-CS",
        status: "ENROLLED",
        year: "2026/27",
        page: "2",
      }),
    ).toEqual({
      q: "hart",
      programme: "BSC-CS",
      status: "ENROLLED",
      year: "2026/27",
      page: 2,
    });
  });

  it("ignores empty and malformed values instead of failing", () => {
    expect(
      studentFiltersSchema.parse({
        q: "",
        status: "GRADUATED",
        year: "2026",
        page: "-3",
      }),
    ).toEqual({
      q: undefined,
      programme: undefined,
      status: undefined,
      year: undefined,
      page: 1,
    });
  });

  it("cuts an over-long search short rather than listing everyone", () => {
    const parsed = studentFiltersSchema.parse({
      q: "a".repeat(150),
      programme: "B".repeat(40),
    });
    expect(parsed.q).toBe("a".repeat(100));
    expect(parsed.programme).toBe("B".repeat(32));
  });
});
