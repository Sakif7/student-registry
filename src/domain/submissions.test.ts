import { describe, expect, it } from "vitest";

import {
  ACCEPTED_DOCUMENTS,
  assessmentState,
  checkSubmission,
  checkUploadedFile,
  compareAssessments,
  documentKindOf,
  isLate,
  MAX_UPLOAD_BYTES,
  precheckFile,
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

  it("accepts a declared type the browser didn't know", () => {
    for (const type of ["", "application/octet-stream"]) {
      expect(checkUploadedFile({ ...docx, type }, { ext: "docx" })).toEqual({
        kind: "docx",
      });
    }
  });

  it("refuses a file whose content doesn't match its name", () => {
    expect(checkUploadedFile(pdf, undefined)).toEqual({
      problem: "CONTENT_MISMATCH",
    });
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
