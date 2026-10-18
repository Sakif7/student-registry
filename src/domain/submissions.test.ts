import { describe, expect, it } from "vitest";

import {
  ACCEPTED_DOCUMENTS,
  type AssessmentState,
  assessmentListSchema,
  assessmentState,
  checkSubmission,
  checkUploadedFile,
  compareAssessments,
  documentKindOf,
  filterAssessments,
  expectedToSubmit,
  isLate,
  MAX_UPLOAD_BYTES,
  precheckFile,
  safeFileName,
  sortAssessments,
} from "./submissions";

const deadline = new Date("2026-11-20T17:00:00.000Z");
const before = new Date("2026-11-20T16:59:59.999Z");
const after = new Date("2026-11-20T17:00:00.001Z");
const open = { deadline, closedAt: null };

describe("documentKindOf", () => {
  it("recognises PDF and DOCX regardless of case", () => {
    expect(documentKindOf("essay.pdf")).toBe("pdf");
    expect(documentKindOf("Essay.PDF")).toBe("pdf");
    expect(documentKindOf("report.final.docx")).toBe("docx");
  });

  it.each(["essay.doc", "essay.docm", "essay.pdf.exe", "essay", "pdf"])(
    "rejects %j",
    (name) => {
      expect(documentKindOf(name)).toBeNull();
    },
  );
});

describe("safeFileName", () => {
  it("drops folders and characters unsafe in a download header", () => {
    expect(safeFileName("C:\\Users\\amelia\\Essay.pdf")).toBe("Essay.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName('My "final"\u0000 essay.pdf')).toBe(
      "My final essay.pdf",
    );
  });

  it("drops the marks that would make a name read backwards", () => {
    expect(safeFileName("essay‮xcod.pdf")).toBe("essayxcod.pdf");
    expect(safeFileName("⁧report⁩.docx")).toBe("report.docx");
  });

  it("falls back to a generic name when nothing is left", () => {
    expect(safeFileName("\u0007")).toBe("submission");
  });

  it("shortens long names but keeps the extension", () => {
    const name = safeFileName(`${"a".repeat(200)}.docx`);
    expect(name).toHaveLength(120);
    expect(name.endsWith(".docx")).toBe(true);
  });
});

describe("assessmentState and isLate", () => {
  it("is open up to and including the deadline", () => {
    expect(assessmentState(open, before, false)).toBe("OPEN");
    expect(assessmentState(open, deadline, false)).toBe("OPEN");
    expect(assessmentState(open, after, false)).toBe("ACCEPTING_LATE");
  });

  it("is closed once staff close it, whatever the time", () => {
    expect(assessmentState({ deadline, closedAt: before }, before, false)).toBe(
      "CLOSED",
    );
  });

  it("is closed once its academic year ends, even if staff never closed it", () => {
    expect(assessmentState(open, after, true)).toBe("CLOSED");
  });

  it("counts work as late from the first moment after the deadline", () => {
    expect(isLate(deadline, deadline)).toBe(false);
    expect(isLate(after, deadline)).toBe(true);
  });
});

describe("expectedToSubmit", () => {
  const september = new Date("2026-09-14T09:00:00Z");
  const enrolled = {
    registeredAt: september,
    status: "ENROLLED" as const,
    history: [{ toStatus: "ENROLLED" as const, changedAt: september }],
  };
  // Enrolled at the deadline, withdrawn a week later.
  const withdrewAfter = {
    ...enrolled,
    status: "WITHDRAWN" as const,
    history: [
      ...enrolled.history,
      {
        toStatus: "WITHDRAWN" as const,
        changedAt: new Date("2026-11-27T12:00:00Z"),
      },
    ],
  };

  it("expects the students enrolled now, until the deadline", () => {
    expect(expectedToSubmit(enrolled, deadline, before)).toBe(true);
    expect(expectedToSubmit(withdrewAfter, deadline, before)).toBe(false);
  });

  it("goes on expecting a student who was due at the deadline, whatever happened since", () => {
    const later = new Date("2027-07-01T12:00:00Z");
    expect(expectedToSubmit(withdrewAfter, deadline, later)).toBe(true);
    expect(
      expectedToSubmit(
        { ...withdrewAfter, status: "COMPLETED" as const },
        deadline,
        later,
      ),
    ).toBe(true);
  });

  it("doesn't expect a student who joined after the deadline, or wasn't enrolled at it", () => {
    expect(
      expectedToSubmit({ ...enrolled, registeredAt: after }, deadline, after),
    ).toBe(false);
    const deferredThen = {
      ...enrolled,
      history: [
        ...enrolled.history,
        {
          toStatus: "DEFERRED" as const,
          changedAt: new Date("2026-10-05T10:00:00Z"),
        },
        { toStatus: "ENROLLED" as const, changedAt: after },
      ],
    };
    expect(expectedToSubmit(deferredThen, deadline, after)).toBe(false);
  });

  it("takes a record with no history as it is now", () => {
    expect(
      expectedToSubmit({ ...enrolled, history: [] }, deadline, after),
    ).toBe(true);
    expect(
      expectedToSubmit(
        { ...enrolled, status: "WITHDRAWN" as const, history: [] },
        deadline,
        after,
      ),
    ).toBe(false);
  });
});

describe("checkSubmission", () => {
  const base = {
    status: "ENROLLED" as const,
    registered: true,
    assessment: open,
    yearEnded: false,
    alreadySubmitted: false,
    now: before,
  };

  it("accepts a first submission before the deadline", () => {
    expect(checkSubmission(base)).toEqual({
      allowed: true,
      late: false,
      resubmission: false,
    });
  });

  it("accepts a resubmission before the deadline", () => {
    expect(checkSubmission({ ...base, alreadySubmitted: true })).toEqual({
      allowed: true,
      late: false,
      resubmission: true,
    });
  });

  it("accepts a first submission after the deadline, flagged late", () => {
    expect(checkSubmission({ ...base, now: after })).toEqual({
      allowed: true,
      late: true,
      resubmission: false,
    });
  });

  it("refuses to replace a submission after the deadline", () => {
    expect(
      checkSubmission({ ...base, now: after, alreadySubmitted: true }),
    ).toEqual({ allowed: false, reason: "DEADLINE_PASSED" });
  });

  it("refuses once the assessment is closed", () => {
    expect(
      checkSubmission({
        ...base,
        assessment: { deadline, closedAt: after },
        now: after,
      }),
    ).toEqual({ allowed: false, reason: "CLOSED" });
  });

  it("refuses late work once the assessment's academic year has ended", () => {
    expect(checkSubmission({ ...base, now: after, yearEnded: true })).toEqual({
      allowed: false,
      reason: "YEAR_ENDED",
    });
    // Staff closing it says so first.
    expect(
      checkSubmission({
        ...base,
        assessment: { deadline, closedAt: after },
        now: after,
        yearEnded: true,
      }),
    ).toEqual({ allowed: false, reason: "CLOSED" });
  });

  it.each(["DEFERRED", "WITHDRAWN", "COMPLETED"] as const)(
    "refuses a %s student",
    (status) => {
      expect(checkSubmission({ ...base, status })).toEqual({
        allowed: false,
        reason: "NOT_ENROLLED",
      });
    },
  );

  it("refuses an assessment on a module the student isn't registered on", () => {
    expect(checkSubmission({ ...base, registered: false })).toEqual({
      allowed: false,
      reason: "NOT_REGISTERED",
    });
  });
});

describe("precheckFile", () => {
  it("accepts a PDF or DOCX of up to 10 MB", () => {
    expect(precheckFile({ name: "essay.pdf", size: 1 })).toBeNull();
    expect(precheckFile({ name: "essay.docx", size: MAX_UPLOAD_BYTES })).toBe(
      null,
    );
  });

  it("refuses an empty or oversized file, or another type", () => {
    expect(precheckFile({ name: "essay.pdf", size: 0 })).toBe("EMPTY");
    expect(
      precheckFile({ name: "essay.pdf", size: MAX_UPLOAD_BYTES + 1 }),
    ).toBe("TOO_LARGE");
    expect(precheckFile({ name: "essay.doc", size: 1 })).toBe("NOT_A_DOCUMENT");
    expect(precheckFile({ name: "essay.DOCM", size: 1 })).toBe("MACRO_ENABLED");
  });
});

describe("checkUploadedFile", () => {
  const pdf = { name: "essay.pdf", type: "application/pdf", size: 2048 };
  const docx = {
    name: "essay.docx",
    type: ACCEPTED_DOCUMENTS.docx.mimeType,
    size: 2048,
  };

  it("accepts a file whose name, declared type and content agree", () => {
    expect(checkUploadedFile(pdf, { ext: "pdf" })).toEqual({ kind: "pdf" });
    expect(checkUploadedFile(docx, { ext: "docx" })).toEqual({ kind: "docx" });
  });

  it("accepts a declared type the browser didn't know, or none", () => {
    for (const type of ["", "application/octet-stream", "text/plain"]) {
      expect(checkUploadedFile({ ...docx, type }, { ext: "docx" })).toEqual({
        kind: "docx",
      });
    }
  });

  it("refuses a file whose content doesn't match its name", () => {
    expect(checkUploadedFile(pdf, undefined)).toEqual({
      problem: "CONTENT_MISMATCH",
    });
    // A text file renamed, sent without a type.
    expect(
      checkUploadedFile({ ...pdf, type: "text/plain" }, undefined),
    ).toEqual({ problem: "CONTENT_MISMATCH" });
    expect(checkUploadedFile(pdf, { ext: "docx" })).toEqual({
      problem: "CONTENT_MISMATCH",
    });
  });

  it("refuses a declared type that contradicts the name", () => {
    expect(
      checkUploadedFile({ ...pdf, type: "text/html" }, { ext: "pdf" }),
    ).toEqual({ problem: "CONTENT_MISMATCH" });
  });

  it("refuses a macro-enabled document, even renamed to .docx", () => {
    expect(checkUploadedFile(docx, { ext: "docm" })).toEqual({
      problem: "MACRO_ENABLED",
    });
  });

  it("makes the name and size checks first", () => {
    expect(checkUploadedFile({ ...pdf, size: 0 }, { ext: "pdf" })).toEqual({
      problem: "EMPTY",
    });
  });
});

describe("compareAssessments", () => {
  const at = (iso: string) => new Date(iso);
  it("lists open assessments soonest first, then the rest latest first", () => {
    const assessments = [
      { title: "Closed", state: "CLOSED", deadline: at("2026-10-01T16:00Z") },
      {
        title: "Late",
        state: "ACCEPTING_LATE",
        deadline: at("2026-10-05T16:00Z"),
      },
      {
        title: "Later",
        state: "ACCEPTING_LATE",
        deadline: at("2026-10-10T16:00Z"),
      },
      { title: "Far", state: "OPEN", deadline: at("2026-12-04T17:00Z") },
      { title: "Soon", state: "OPEN", deadline: at("2026-10-20T16:00Z") },
    ] as const;
    expect(
      [...assessments].sort(compareAssessments).map(({ title }) => title),
    ).toEqual(["Soon", "Far", "Later", "Late", "Closed"]);
  });
});

describe("sortAssessments", () => {
  const listed = (
    title: string,
    moduleCode: string,
    deadlineIso: string,
    state: AssessmentState,
    submittedCount: number,
  ) => ({
    title,
    module: { code: moduleCode },
    deadline: new Date(deadlineIso),
    state,
    submittedCount,
    expectedCount: 4,
  });
  const list = [
    listed("Essay", "BM4001", "2026-10-20T16:00:00Z", "OPEN", 1),
    listed("Report", "DS7001", "2026-10-10T16:00:00Z", "ACCEPTING_LATE", 3),
    listed("Proposal", "BM4001", "2026-11-01T17:00:00Z", "OPEN", 0),
    listed("Coursework", "CS4001", "2026-10-01T16:00:00Z", "CLOSED", 4),
  ];
  const titles = (sorted: readonly { title: string }[]) =>
    sorted.map(({ title }) => title);

  it("keeps the usual order by default: open first, soonest deadline first", () => {
    expect(titles(sortAssessments(list))).toEqual([
      "Essay",
      "Proposal",
      "Report",
      "Coursework",
    ]);
  });

  it("sorts by a column either way, with ties in the usual order", () => {
    expect(titles(sortAssessments(list, "module"))).toEqual([
      "Essay",
      "Proposal",
      "Coursework",
      "Report",
    ]);
    expect(titles(sortAssessments(list, "module", "desc"))).toEqual([
      "Report",
      "Coursework",
      "Essay",
      "Proposal",
    ]);
    expect(titles(sortAssessments(list, "deadline"))).toEqual([
      "Coursework",
      "Report",
      "Essay",
      "Proposal",
    ]);
    expect(titles(sortAssessments(list, "title"))).toEqual([
      "Coursework",
      "Essay",
      "Proposal",
      "Report",
    ]);
  });

  it("sorts by the share of expected students who have submitted", () => {
    expect(titles(sortAssessments(list, "submitted", "desc"))).toEqual([
      "Coursework",
      "Report",
      "Essay",
      "Proposal",
    ]);
  });
});

describe("filterAssessments", () => {
  const listed = (
    title: string,
    module: { code: string; title: string },
    academicYear: string,
    state: AssessmentState,
  ) => ({ title, module, academicYear, state });
  const databases = { code: "CS4002", title: "Databases" };
  const list = [
    listed("SQL lab test", databases, "2026/27", "OPEN"),
    listed("Design report", databases, "2026/27", "CLOSED"),
    listed(
      "Essay",
      { code: "BM4001", title: "Management" },
      "2025/26",
      "CLOSED",
    ),
  ];
  const titles = (filtered: readonly { title: string }[]) =>
    filtered.map(({ title }) => title);

  it("searches titles and the modules' codes and titles", () => {
    expect(titles(filterAssessments(list, { q: "lab" }))).toEqual([
      "SQL lab test",
    ]);
    expect(titles(filterAssessments(list, { q: "cs40" }))).toEqual([
      "SQL lab test",
      "Design report",
    ]);
    expect(titles(filterAssessments(list, { q: "management" }))).toEqual([
      "Essay",
    ]);
  });

  it("narrows to a state and an academic year, together with a search", () => {
    expect(titles(filterAssessments(list, { state: "CLOSED" }))).toEqual([
      "Design report",
      "Essay",
    ]);
    expect(
      titles(filterAssessments(list, { state: "CLOSED", year: "2026/27" })),
    ).toEqual(["Design report"]);
    expect(filterAssessments(list, { q: "essay", year: "2026/27" })).toEqual(
      [],
    );
  });

  it("reads the list's settings from the URL, ignoring what it can't use", () => {
    expect(
      assessmentListSchema.parse({
        q: " lab ",
        state: "CLOSED",
        year: "2026/27",
        page: "2",
        sort: "deadline",
        dir: "desc",
      }),
    ).toEqual({
      q: "lab",
      state: "CLOSED",
      year: "2026/27",
      page: 2,
      sort: "deadline",
      dir: "desc",
    });
    expect(
      assessmentListSchema.parse({ state: "LOST", year: "2026", page: "x" }),
    ).toEqual({
      q: undefined,
      state: undefined,
      year: undefined,
      page: undefined,
      sort: undefined,
      dir: undefined,
    });
  });
});
