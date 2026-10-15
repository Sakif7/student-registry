import { describe, expect, it } from "vitest";

import {
  assessmentState,
  checkSubmission,
  documentKindOf,
  isLate,
  safeFileName,
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
    expect(assessmentState(open, before)).toBe("OPEN");
    expect(assessmentState(open, deadline)).toBe("OPEN");
    expect(assessmentState(open, after)).toBe("ACCEPTING_LATE");
  });

  it("is closed once staff close it, whatever the time", () => {
    expect(assessmentState({ deadline, closedAt: before }, before)).toBe(
      "CLOSED",
    );
  });

  it("counts work as late from the first moment after the deadline", () => {
    expect(isLate(deadline, deadline)).toBe(false);
    expect(isLate(after, deadline)).toBe(true);
  });
});

describe("checkSubmission", () => {
  const base = {
    status: "ENROLLED" as const,
    onProgramme: true,
    assessment: open,
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

  it.each(["DEFERRED", "WITHDRAWN", "COMPLETED"] as const)(
    "refuses a %s student",
    (status) => {
      expect(checkSubmission({ ...base, status })).toEqual({
        allowed: false,
        reason: "NOT_ENROLLED",
      });
    },
  );

  it("refuses an assessment from another programme", () => {
    expect(checkSubmission({ ...base, onProgramme: false })).toEqual({
      allowed: false,
      reason: "NOT_ON_PROGRAMME",
    });
  });
});
