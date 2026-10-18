// Submitting work: PUT /api/assessments/{id}/submission, downloading it with
// GET /api/submissions/{id}/file, and a student's assessments with
// GET /api/students/{number}/assessments.
import { existsSync, readdirSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PUT as putSubmission } from "@/app/api/assessments/[assessmentId]/submission/route";
import { GET as listStudentAssessments } from "@/app/api/students/[studentNumber]/assessments/route";
import { GET as downloadFile } from "@/app/api/submissions/[submissionId]/file/route";
import { MAX_UPLOAD_BYTES } from "@/domain/submissions";
import { db } from "@/server/db";

import { sampleDocx, samplePdf } from "../../prisma/sample-documents";
import {
  createAssessment,
  createModule,
  createProgramme,
  createStudent,
  registerStudents,
} from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  signIn,
  STAFF,
  type Viewer,
} from "../helpers/requests";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "";
const BEFORE_DEADLINE = new Date("2026-11-13T10:00:00.000Z");
const DEADLINE = new Date("2026-11-20T17:00:00.000Z");
const AFTER_DEADLINE = new Date("2026-11-21T09:00:00.000Z");
const AMELIA = asStudent("SMS-2025-0001");
const UNKNOWN_ID = "0195f6b4-0000-7000-8000-000000000000";

interface SubmissionBody {
  submission: {
    id: string;
    fileName: string;
    attempt: number;
    late: boolean;
    sizeBytes: number;
  };
}

let moduleId: string;
let assessmentId: string;
let otherModuleAssessmentId: string;

beforeEach(async () => {
  // Only ever empty the dedicated test folder.
  expect(UPLOAD_DIR).toContain("student-registry-test-uploads");
  await rm(UPLOAD_DIR, { recursive: true, force: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(BEFORE_DEADLINE);

  const computing = await createProgramme({ code: "BSC-CS" });
  const data = await createProgramme({ code: "MSC-DS" });
  moduleId = (
    await createModule({
      code: "CS4001",
      title: "Programming",
      programmeId: computing.id,
    })
  ).id;
  assessmentId = (
    await createAssessment({
      title: "Coursework 1",
      moduleId,
      deadline: DEADLINE,
    })
  ).id;
  otherModuleAssessmentId = (
    await createAssessment({
      moduleId: (
        await createModule({
          code: "DS7001",
          title: "ML",
          programmeId: data.id,
        })
      ).id,
    })
  ).id;
  const students = [
    await createStudent({
      studentNumber: "SMS-2025-0001",
      programmeId: computing.id,
    }),
    await createStudent({
      studentNumber: "SMS-2026-0001",
      programmeId: computing.id,
    }),
    // Registered, then deferred.
    await createStudent({
      studentNumber: "SMS-2026-0003",
      programmeId: computing.id,
      status: "DEFERRED",
    }),
  ];
  await registerStudents(
    moduleId,
    students.map(({ id }) => id),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

const pdf = (name = "essay.pdf", type = "application/pdf") =>
  new File([new Uint8Array(samplePdf("Essay", ["Amelia Hart"]))], name, {
    type,
  });
const docx = (name = "essay.docx", macroEnabled = false) =>
  new File(
    [new Uint8Array(sampleDocx("Essay", ["Second draft"], { macroEnabled }))],
    name,
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  );

async function upload(
  file: File | null,
  {
    session = AMELIA,
    id = assessmentId,
    headers,
  }: {
    session?: Viewer | null;
    id?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const body = new FormData();
  if (file) body.append("file", file);
  const response = await putSubmission(
    await apiRequest("PUT", `/api/assessments/${id}/submission`, {
      session,
      body,
      headers,
    }),
    routeContext({ assessmentId: id }),
  );
  return { status: response.status, body: await bodyOf(response) };
}

/** Uploads a file as Amelia, expecting success, and returns its ID. */
async function submitted(file = pdf()): Promise<string> {
  const { status, body } = await upload(file);
  expect(status).toBe(201);
  return (body as Partial<SubmissionBody>).submission?.id ?? "";
}

async function download(id: string, session: Viewer | null = STAFF) {
  return downloadFile(
    await apiRequest("GET", `/api/submissions/${id}/file`, { session }),
    routeContext({ submissionId: id }),
  );
}

/** The files in the upload folder, which must match the stored keys. */
async function storedKeys() {
  const rows = await db().submission.findMany({ select: { storageKey: true } });
  return {
    onDisk: existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR).sort() : [],
    inDatabase: rows.map((row) => row.storageKey).sort(),
  };
}

describe("PUT /api/assessments/[assessmentId]/submission", () => {
  it("accepts a PDF before the deadline, for staff to download", async () => {
    const { status, body } = await upload(pdf());

    expect(status).toBe(201);
    expect(body).toMatchObject({
      submission: { fileName: "essay.pdf", attempt: 1, late: false },
    });
    const id = (body as Partial<SubmissionBody>).submission?.id ?? "";
    const response = await download(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="essay.pdf"; filename*=UTF-8''essay.pdf`,
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      samplePdf("Essay", ["Amelia Hart"]),
    );
  });

  it("replaces the work until the deadline, keeping only the new file", async () => {
    await upload(pdf());
    const { status, body } = await upload(docx());

    expect(status).toBe(200);
    expect(body).toMatchObject({
      submission: { fileName: "essay.docx", attempt: 2, late: false },
    });
    const { onDisk, inDatabase } = await storedKeys();
    expect(inDatabase).toHaveLength(1);
    expect(onDisk).toEqual(inDatabase);
  });

  it("accepts a first submission after the deadline as late, but no replacement", async () => {
    vi.setSystemTime(AFTER_DEADLINE);
    const first = await upload(pdf());
    expect(first).toMatchObject({
      status: 201,
      body: { submission: { late: true } },
    });

    expect(await upload(docx())).toMatchObject({
      status: 409,
      body: {
        detail:
          "The deadline has passed, so your submission can no longer be replaced.",
      },
    });
    const { onDisk, inDatabase } = await storedKeys();
    expect(onDisk).toEqual(inDatabase);
    expect(await db().submission.findFirst()).toMatchObject({
      fileName: "essay.pdf",
      attempt: 1,
    });
  });

  it("refuses work once the assessment is closed", async () => {
    await db().assessment.update({
      where: { id: assessmentId },
      data: { closedAt: BEFORE_DEADLINE },
    });
    expect(await upload(pdf())).toMatchObject({
      status: 409,
      body: { detail: "This assessment is closed to submissions." },
    });
    expect(await storedKeys()).toEqual({ onDisk: [], inDatabase: [] });
  });

  it("refuses late work once the assessment's academic year has ended", async () => {
    // Last year's coursework, never closed, on a module Amelia took then.
    const lastYear = await createAssessment({
      title: "Last year's coursework",
      moduleId,
      deadline: new Date("2026-03-20T17:00:00.000Z"),
    });
    const amelia = await db().student.findUniqueOrThrow({
      where: { studentNumber: "SMS-2025-0001" },
    });
    await registerStudents(moduleId, [amelia.id], "2025/26");

    expect(await upload(pdf(), { id: lastYear.id })).toMatchObject({
      status: 409,
      body: {
        detail:
          "This assessment's academic year has ended, so it takes no more work.",
      },
    });
    expect(await storedKeys()).toEqual({ onDisk: [], inDatabase: [] });
  });

  it("refuses a student who isn't enrolled, and hides assessments on modules they don't take", async () => {
    expect(
      await upload(pdf(), { session: asStudent("SMS-2026-0003") }),
    ).toMatchObject({
      status: 403,
      body: { detail: "Only enrolled students can submit work." },
    });
    expect((await upload(pdf(), { id: otherModuleAssessmentId })).status).toBe(
      404,
    );
    expect((await upload(pdf(), { id: UNKNOWN_ID })).status).toBe(404);
    expect((await upload(pdf(), { id: "not-an-id" })).status).toBe(404);
    expect(await storedKeys()).toEqual({ onDisk: [], inDatabase: [] });
  });

  it("is for students only", async () => {
    expect((await upload(pdf(), { session: STAFF })).status).toBe(403);
    expect((await upload(pdf(), { session: null })).status).toBe(401);
  });

  it("refuses files that aren't genuine PDF or Word documents", async () => {
    const html = new File(["<html><body>Hi</body></html>"], "essay.pdf", {
      type: "application/pdf",
    });
    const cases = [
      [
        new File(["notes"], "essay.txt", { type: "text/plain" }),
        415,
        "Upload a PDF or a Word document (.docx)",
      ],
      [
        html,
        415,
        "This file isn't a valid PDF or Word document, whatever its name says",
      ],
      [
        docx("essay.docx", true),
        415,
        "Macro-enabled Word documents can't be accepted. Save the document as .docx and upload that",
      ],
      [
        pdf("essay.pdf", "text/html"),
        415,
        "This file isn't a valid PDF or Word document, whatever its name says",
      ],
      [
        new File([], "essay.pdf", { type: "application/pdf" }),
        400,
        "The file is empty",
      ],
    ] as const;

    for (const [file, status, message] of cases) {
      expect(await upload(file)).toMatchObject({
        status,
        body: { errors: { file: [message] } },
      });
    }
    expect(await storedKeys()).toEqual({ onDisk: [], inDatabase: [] });
  });

  it("refuses a file over 10 MB", async () => {
    // A real PDF header followed by padding, one byte over the limit.
    const header = samplePdf("Essay", []);
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(header);
    expect(
      await upload(new File([big], "big.pdf", { type: "application/pdf" })),
    ).toMatchObject({
      status: 413,
      body: { errors: { file: ["The file is larger than 10 MB"] } },
    });

    // A declared length over the limit is refused before the body is read.
    expect(
      await upload(pdf(), {
        headers: { "content-length": String(20 * 1024 * 1024) },
      }),
    ).toMatchObject({
      status: 413,
      body: { detail: "The file is larger than 10 MB." },
    });
    expect(await storedKeys()).toEqual({ onDisk: [], inDatabase: [] });
  });

  it("stops reading a body that grows past the limit without a declared length", async () => {
    // A valid start of a multipart body, then a file that never ends.
    const start = new TextEncoder().encode(
      [
        "--x",
        'Content-Disposition: form-data; name="file"; filename="big.pdf"',
        "Content-Type: application/pdf",
        "",
        "%PDF-1.4",
      ].join("\r\n"),
    );
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(start);
      },
      pull(controller) {
        sent += chunk.byteLength;
        if (sent > 50 * 1024 * 1024) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}/submission`,
      {
        method: "PUT",
        body: endless,
        duplex: "half",
        headers: {
          cookie: (await signIn(AMELIA)).cookie,
          "content-type": "multipart/form-data; boundary=x",
        },
      },
    );
    const response = await putSubmission(
      request,
      routeContext({ assessmentId }),
    );
    expect(response.status).toBe(413);
    // It gave up soon after the limit, long before the 50 MB the client
    // would have sent (streams read a few chunks ahead).
    expect(sent).toBeLessThan(16 * 1024 * 1024);
  });

  it("needs a file, sent as multipart/form-data", async () => {
    expect(await upload(null)).toMatchObject({
      status: 400,
      body: { errors: { file: ["Choose a file to upload"] } },
    });
    const response = await putSubmission(
      await apiRequest("PUT", `/api/assessments/${assessmentId}/submission`, {
        session: AMELIA,
        json: { file: "essay.pdf" },
      }),
      routeContext({ assessmentId }),
    );
    expect(response.status).toBe(415);
  });

  it("lets only one of two simultaneous first submissions through", async () => {
    const statuses = (await Promise.all([upload(pdf()), upload(docx())]))
      .map(({ status }) => status)
      .sort();
    // Either the second waited and replaced the first, or both inserted at
    // once and the unique constraint refused one.
    expect([
      [200, 201],
      [201, 409],
    ]).toContainEqual(statuses);
    const { onDisk, inDatabase } = await storedKeys();
    expect(inDatabase).toHaveLength(1);
    expect(onDisk).toEqual(inDatabase);
  });
});

describe("GET /api/submissions/[submissionId]/file", () => {
  it("is for staff and the student who submitted", async () => {
    const id = await submitted();

    expect((await download(id, AMELIA)).status).toBe(200);
    expect((await download(id, asStudent("SMS-2026-0001"))).status).toBe(403);
    expect((await download(id, null)).status).toBe(401);
    expect((await download(UNKNOWN_ID)).status).toBe(404);
    expect((await download("not-an-id")).status).toBe(404);
  });

  it("names the file safely, whatever characters its name has", async () => {
    const id = await submitted(pdf("Résumé (v2).pdf"));

    const response = await download(id);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="R_sum_ (v2).pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%28v2%29.pdf`,
    );
  });

  it("reports a file missing from storage as gone", async () => {
    const id = await submitted();
    const [key] = (await storedKeys()).onDisk;
    await unlink(join(UPLOAD_DIR, key ?? ""));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await download(id);
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({
      detail: "This file is no longer available.",
    });
  });
});

describe("GET /api/students/[studentNumber]/assessments", () => {
  async function list(studentNumber: string, session: Viewer | null) {
    const response = await listStudentAssessments(
      await apiRequest("GET", `/api/students/${studentNumber}/assessments`, {
        session,
      }),
      routeContext({ studentNumber }),
    );
    return { status: response.status, body: await bodyOf(response) };
  }

  it("lists the assessments of the student's modules, with their own work", async () => {
    await upload(pdf());

    expect(await list("SMS-2025-0001", AMELIA)).toMatchObject({
      status: 200,
      body: {
        assessments: [
          {
            title: "Coursework 1",
            state: "OPEN",
            submission: { fileName: "essay.pdf", late: false },
            upload: { allowed: true, resubmission: true },
          },
        ],
      },
    });
    expect(await list("SMS-2026-0001", STAFF)).toMatchObject({
      body: {
        assessments: [
          { submission: null, upload: { allowed: true, resubmission: false } },
        ],
      },
    });
  });

  it("leaves out a module's assessments from years the student wasn't on it", async () => {
    // Amelia is registered on CS4001 for 2026/27, not for 2025/26.
    await createAssessment({
      title: "Last year's coursework",
      moduleId,
      deadline: new Date("2026-03-20T17:00:00.000Z"),
    });

    const { body } = await list("SMS-2025-0001", AMELIA);

    expect(
      (body.assessments as { title: string }[]).map(({ title }) => title),
    ).toEqual(["Coursework 1"]);
  });

  it("leaves out the assessments of other years' modules on the student's programme", async () => {
    // A year 3 student on Amelia's programme, taking a year 3 module. Being
    // on the programme doesn't make CS4001, a year 1 module, theirs.
    const { id: programmeId } = await db().programme.findUniqueOrThrow({
      where: { code: "BSC-CS" },
    });
    const finalYear = await createModule({
      code: "CS6001",
      title: "Final year project",
      programmeId,
      yearOfStudy: 3,
    });
    await createAssessment({ title: "Dissertation", moduleId: finalYear.id });
    const finalist = await createStudent({
      studentNumber: "SMS-2024-0001",
      programmeId,
      yearOfStudy: 3,
    });
    await registerStudents(finalYear.id, [finalist.id]);
    const viewer = asStudent("SMS-2024-0001");

    const { body } = await list("SMS-2024-0001", viewer);

    expect(
      (body.assessments as { title: string }[]).map(({ title }) => title),
    ).toEqual(["Dissertation"]);
    expect((await upload(pdf(), { session: viewer })).status).toBe(404);
  });

  it("says why a student can't submit", async () => {
    expect(
      await list("SMS-2026-0003", asStudent("SMS-2026-0003")),
    ).toMatchObject({
      body: {
        assessments: [
          {
            upload: {
              allowed: false,
              reason: "NOT_ENROLLED",
              message: "Only enrolled students can submit work.",
            },
          },
        ],
      },
    });
  });

  it("is for staff or the student themselves", async () => {
    expect(
      (await list("SMS-2025-0001", asStudent("SMS-2026-0001"))).status,
    ).toBe(403);
    expect((await list("SMS-2099-0001", STAFF)).status).toBe(404);
  });
});
