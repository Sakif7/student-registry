// Entering marks on an assessment's marksheet: PUT /api/assessments/{id}/marks.
import { beforeEach, describe, expect, it } from "vitest";

import { PUT as putMarks } from "@/app/api/assessments/[assessmentId]/marks/route";
import { db } from "@/server/db";

import {
  createAssessment,
  createModule,
  createProgramme,
  createStudent,
  createSubmission,
  registerStudents,
} from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  STAFF,
  type Viewer,
} from "../helpers/requests";

const PUBLISHED_AT = new Date("2026-10-01T09:00:00.000Z");

interface MarksheetBody {
  assessment: {
    students: {
      studentNumber: string;
      submission: object | null;
      result: {
        mark: number;
        classification: string;
        publishedAt: string | null;
      } | null;
    }[];
  };
}

let assessmentId: string;
let amelia: { id: string };
let hannah: { id: string };

beforeEach(async () => {
  const computing = await createProgramme({ code: "BSC-CS" });
  const data = await createProgramme({ code: "MSC-DS" });
  const moduleId = (
    await createModule({
      code: "CS4001",
      title: "Programming",
      programmeId: computing.id,
    })
  ).id;
  assessmentId = (await createAssessment({ moduleId })).id;
  amelia = await createStudent({
    studentNumber: "SMS-2025-0001",
    fullName: "Amelia Hart",
    programmeId: computing.id,
  });
  const oliver = await createStudent({
    studentNumber: "SMS-2026-0001",
    fullName: "Oliver Bennett",
    programmeId: computing.id,
  });
  hannah = await createStudent({
    studentNumber: "SMS-2026-0005",
    fullName: "Hannah Kowalski",
    programmeId: computing.id,
    status: "WITHDRAWN",
  });
  await createStudent({
    studentNumber: "SMS-2026-0004",
    fullName: "Liam O'Connor",
    programmeId: data.id,
  });
  // Hannah was registered before she withdrew; Liam is on another programme.
  await registerStudents(moduleId, [amelia.id, oliver.id, hannah.id]);
  await createSubmission({ studentId: amelia.id, assessmentId });
});

async function save(
  marks: Record<string, number | null>,
  {
    session = STAFF,
    id = assessmentId,
  }: { session?: Viewer; id?: string } = {},
) {
  const response = await putMarks(
    await apiRequest("PUT", `/api/assessments/${id}/marks`, {
      session,
      json: { marks },
    }),
    routeContext({ assessmentId: id }),
  );
  return {
    status: response.status,
    body: await bodyOf<MarksheetBody & Record<string, unknown>>(response),
  };
}

const rowsOf = (body: MarksheetBody) =>
  Object.fromEntries(
    body.assessment.students.map((row) => [row.studentNumber, row.result]),
  );

describe("PUT /api/assessments/[assessmentId]/marks", () => {
  it("saves marks, with or without a submission, and classifies them", async () => {
    const { status, body } = await save({
      "SMS-2025-0001": 72,
      "sms-2026-0001": 38,
    });

    expect(status).toBe(200);
    expect(rowsOf(body)).toEqual({
      "SMS-2025-0001": {
        mark: 72,
        classification: "DISTINCTION",
        publishedAt: null,
      },
      "SMS-2026-0001": { mark: 38, classification: "FAIL", publishedAt: null },
    });
  });

  it("unpublishes a changed mark, but not one saved unchanged", async () => {
    await db().assessmentResult.create({
      data: {
        studentId: amelia.id,
        assessmentId,
        mark: 65,
        publishedAt: PUBLISHED_AT,
      },
    });

    const unchanged = await save({ "SMS-2025-0001": 65 });
    expect(rowsOf(unchanged.body)["SMS-2025-0001"]).toMatchObject({
      publishedAt: PUBLISHED_AT.toISOString(),
    });

    const changed = await save({ "SMS-2025-0001": 68 });
    expect(rowsOf(changed.body)["SMS-2025-0001"]).toEqual({
      mark: 68,
      classification: "MERIT",
      publishedAt: null,
    });
  });

  it("keeps a withdrawn student with a mark on the marksheet, until the mark is removed", async () => {
    await db().assessmentResult.create({
      data: { studentId: hannah.id, assessmentId, mark: 45 },
    });
    expect(rowsOf((await save({ "SMS-2026-0001": 50 })).body)).toHaveProperty(
      "SMS-2026-0005",
      { mark: 45, classification: "PASS", publishedAt: null },
    );

    const { body } = await save({ "SMS-2026-0005": null });
    expect(rowsOf(body)).not.toHaveProperty("SMS-2026-0005");
    expect(
      await db().assessmentResult.count({ where: { studentId: hannah.id } }),
    ).toBe(0);
  });

  it("refuses unknown students and students not on the module, saving nothing", async () => {
    expect(
      await save({
        "SMS-2025-0001": 70,
        "SMS-2026-0004": 50,
        "SMS-2099-0001": 40,
      }),
    ).toMatchObject({
      status: 400,
      body: {
        detail: "Some marks can't be saved.",
        errors: {
          "marks.SMS-2026-0004": [
            "This student isn't registered on the assessment's module",
          ],
          "marks.SMS-2099-0001": ["There is no such student"],
        },
      },
    });
    expect(await db().assessmentResult.count()).toBe(0);
  });

  it("explains a bad mark next to the student it belongs to", async () => {
    expect(await save({ "SMS-2025-0001": 101 })).toMatchObject({
      status: 400,
      body: { errors: { "marks.SMS-2025-0001": ["Marks run from 0 to 100"] } },
    });
  });

  it("is for staff only, and 404s for an unknown assessment", async () => {
    expect(
      (
        await save(
          { "SMS-2025-0001": 60 },
          { session: asStudent("SMS-2025-0001") },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await save(
          { "SMS-2025-0001": 60 },
          { id: "0195f6b4-0000-7000-8000-000000000000" },
        )
      ).status,
    ).toBe(404);
  });
});
