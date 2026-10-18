// Publishing and withholding results: GET /api/students/{number}/results,
// POST .../results/publication, and PUT or DELETE .../results/hold.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as publishAssessment } from "@/app/api/assessments/[assessmentId]/publication/route";
import {
  DELETE as liftHold,
  PUT as putHold,
} from "@/app/api/students/[studentNumber]/results/hold/route";
import { POST as publish } from "@/app/api/students/[studentNumber]/results/publication/route";
import { GET as getResults } from "@/app/api/students/[studentNumber]/results/route";
import { toDbDate } from "@/domain/college-time";
import { db } from "@/server/db";
import {
  listAssessmentsToPublish,
  listResultsWorklist,
} from "@/server/services/results";

import {
  createAssessment,
  createModule,
  createProgramme,
  createStudent,
} from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  sessionFor,
  STAFF,
  type Viewer,
} from "../helpers/requests";

const NOW = new Date("2026-10-15T11:00:00.000Z");
const PUBLISHED_AT = new Date("2026-10-01T09:00:00.000Z");
const AMELIA = asStudent("SMS-2025-0001");
const FEES = "Outstanding tuition fees";

interface ResultsBody {
  withheld: { since: string; reason: string } | null;
  results: {
    assessment: { title: string };
    mark: number;
    classification: string;
    publishedAt: string | null;
  }[];
}

let ameliaId: string;
let examId: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const programme = await createProgramme();
  const moduleId = (
    await createModule({
      code: "CS4001",
      title: "Programming",
      programmeId: programme.id,
    })
  ).id;
  const essay = await createAssessment({
    title: "Essay",
    moduleId,
    deadline: new Date("2026-09-20T16:00:00Z"),
  });
  const exam = await createAssessment({
    title: "Exam",
    moduleId,
    deadline: new Date("2026-10-10T16:00:00Z"),
  });
  examId = exam.id;
  ameliaId = (
    await createStudent({
      studentNumber: "SMS-2025-0001",
      fullName: "Amelia Hart",
      programmeId: programme.id,
    })
  ).id;
  await createStudent({
    studentNumber: "SMS-2026-0001",
    fullName: "Oliver Bennett",
    programmeId: programme.id,
  });
  await db().assessmentResult.createMany({
    data: [
      {
        studentId: ameliaId,
        assessmentId: essay.id,
        mark: 72,
        publishedAt: PUBLISHED_AT,
      },
      { studentId: ameliaId, assessmentId: exam.id, mark: 38 },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const context = routeContext({ studentNumber: "SMS-2025-0001" });

async function read(session: Viewer | null = STAFF) {
  const response = await getResults(
    await apiRequest("GET", "/api/students/SMS-2025-0001/results", { session }),
    context,
  );
  return { status: response.status, body: await bodyOf<ResultsBody>(response) };
}

async function publishAll(session: Viewer | null = STAFF, expected?: number) {
  const response = await publish(
    await apiRequest(
      "POST",
      "/api/students/SMS-2025-0001/results/publication",
      {
        session,
        ...(expected === undefined ? {} : { json: { expected } }),
      },
    ),
    context,
  );
  return { status: response.status, body: await bodyOf(response) };
}

async function withhold(reason: string, session: Viewer | null = STAFF) {
  const response = await putHold(
    await apiRequest("PUT", "/api/students/SMS-2025-0001/results/hold", {
      session,
      json: { reason },
    }),
    context,
  );
  return { status: response.status, body: await bodyOf(response) };
}

async function lift(session: Viewer | null = STAFF) {
  const response = await liftHold(
    await apiRequest("DELETE", "/api/students/SMS-2025-0001/results/hold", {
      session,
    }),
    context,
  );
  return { status: response.status, body: await bodyOf(response) };
}

const marksOf = (body: ResultsBody) =>
  body.results.map(({ assessment, mark }) => [assessment.title, mark]);

describe("GET /api/students/[studentNumber]/results", () => {
  it("shows staff every mark, latest assessment first", async () => {
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      withheld: null,
      results: [
        {
          assessment: { title: "Exam" },
          mark: 38,
          classification: "FAIL",
          publishedAt: null,
        },
        {
          assessment: { title: "Essay" },
          mark: 72,
          classification: "DISTINCTION",
          publishedAt: PUBLISHED_AT.toISOString(),
        },
      ],
    });
  });

  it("never sends a student an unpublished mark", async () => {
    const { status, body } = await read(AMELIA);
    expect(status).toBe(200);
    expect(marksOf(body)).toEqual([["Essay", 72]]);
  });

  it("is for staff, or the student themselves", async () => {
    expect((await read(asStudent("SMS-2026-0001"))).status).toBe(403);
    expect((await read(null)).status).toBe(401);
  });
});

describe("POST /api/students/[studentNumber]/results/publication", () => {
  it("publishes every unpublished mark at once", async () => {
    expect(await publishAll()).toMatchObject({
      status: 200,
      body: { published: 1 },
    });
    expect(marksOf((await read(AMELIA)).body)).toEqual([
      ["Exam", 38],
      ["Essay", 72],
    ]);
    // The earlier publication keeps its own date.
    const results = await db().assessmentResult.findMany({
      orderBy: { mark: "asc" },
    });
    expect(results.map((result) => result.publishedAt)).toEqual([
      NOW,
      PUBLISHED_AT,
    ]);

    expect((await publishAll()).body).toMatchObject({ published: 0 });
  });

  it("publishes nothing if the marks waiting aren't the ones the publisher saw", async () => {
    // One mark is waiting. A dialog that counted none, or two, was opened
    // before a colleague's change, and must not publish what it didn't show.
    for (const expected of [0, 2]) {
      expect(await publishAll(STAFF, expected)).toMatchObject({
        status: 409,
        body: {
          detail:
            "The marks waiting to be published have changed since you looked: there is now 1. Reload the page to check them, then publish again.",
        },
      });
    }
    expect(
      await db().assessmentResult.count({ where: { publishedAt: null } }),
    ).toBe(1);
    expect(await publishAll(STAFF, 1)).toMatchObject({
      status: 200,
      body: { published: 1 },
    });
  });

  it("refuses while results are withheld", async () => {
    await withhold(FEES);
    expect(await publishAll()).toMatchObject({
      status: 409,
      body: {
        detail: `Results are withheld (${FEES}). Lift the hold before publishing.`,
      },
    });
    expect(
      await db().assessmentResult.count({ where: { publishedAt: null } }),
    ).toBe(1);
  });

  it("is for staff only", async () => {
    expect((await publishAll(AMELIA)).status).toBe(403);
  });
});

describe("POST /api/assessments/[assessmentId]/publication", () => {
  async function publishExam(
    expected?: number,
    session: Viewer | null = STAFF,
    id = examId,
  ) {
    const response = await publishAssessment(
      await apiRequest("POST", `/api/assessments/${id}/publication`, {
        session,
        ...(expected === undefined ? {} : { json: { expected } }),
      }),
      routeContext({ assessmentId: id }),
    );
    return { status: response.status, body: await bodyOf(response) };
  }

  /** Oliver's mark for the exam, and Hannah's, whose results are withheld. */
  async function moreExamMarks() {
    const oliver = await db().student.findUniqueOrThrow({
      where: { studentNumber: "SMS-2026-0001" },
    });
    const hannah = await createStudent({
      studentNumber: "SMS-2026-0005",
      fullName: "Hannah Kowalski",
      resultsWithheldAt: PUBLISHED_AT,
      resultsWithheldReason: FEES,
    });
    await db().assessmentResult.createMany({
      data: [
        { studentId: oliver.id, assessmentId: examId, mark: 64 },
        { studentId: hannah.id, assessmentId: examId, mark: 55 },
      ],
    });
    return { oliver, hannah };
  }

  it("publishes an assessment's marks to all its students at once, but not where results are withheld", async () => {
    const { oliver, hannah } = await moreExamMarks();

    expect(await publishExam(2)).toMatchObject({
      status: 200,
      body: { published: 2 },
    });

    const exam = await db().assessmentResult.findMany({
      where: { assessmentId: examId },
      select: { studentId: true, publishedAt: true },
    });
    expect(
      Object.fromEntries(
        exam.map(({ studentId, publishedAt }) => [studentId, publishedAt]),
      ),
    ).toEqual({ [ameliaId]: NOW, [oliver.id]: NOW, [hannah.id]: null });
    // Amelia sees the exam now; the essay, published before, keeps its date.
    expect(marksOf((await read(AMELIA)).body)).toEqual([
      ["Exam", 38],
      ["Essay", 72],
    ]);
    expect(
      (
        await db().assessmentResult.findFirstOrThrow({
          where: { assessmentId: { not: examId } },
        })
      ).publishedAt,
    ).toEqual(PUBLISHED_AT);
    // On each student's record, naming the assessment.
    const events = await db().auditEvent.findMany({
      where: { action: "results.published" },
      select: { studentId: true, details: true },
    });
    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        { studentId: ameliaId, details: { marks: 1, title: "Exam" } },
        { studentId: oliver.id, details: { marks: 1, title: "Exam" } },
      ]),
    );

    expect((await publishExam()).body).toMatchObject({ published: 0 });
  });

  it("publishes nothing if the marks waiting aren't the ones the publisher saw", async () => {
    // Only Amelia's mark is waiting: a dialog that counted two was opened
    // before a change, and must not publish what it didn't show.
    expect(await publishExam(2)).toMatchObject({
      status: 409,
      body: {
        detail:
          "The marks waiting to be published have changed since you looked: there is now 1. Reload the page to check them, then publish again.",
      },
    });
    expect(
      await db().assessmentResult.count({ where: { publishedAt: null } }),
    ).toBe(1);
  });

  it("404s for an unknown or malformed ID, and is for staff only", async () => {
    expect(
      (
        await publishExam(
          undefined,
          STAFF,
          "0195f6b4-0000-7000-8000-000000000000",
        )
      ).status,
    ).toBe(404);
    expect((await publishExam(undefined, STAFF, "not-an-id")).status).toBe(404);
    expect((await publishExam(1, AMELIA)).status).toBe(403);
    expect(
      await db().assessmentResult.count({ where: { publishedAt: null } }),
    ).toBe(1);
  });

  it("lists the assessments with marks waiting, the longest waiting first", async () => {
    await moreExamMarks();
    const staff = await sessionFor(STAFF);

    // The essay's only mark is published, so only the exam is listed.
    expect(await listAssessmentsToPublish(staff)).toMatchObject([
      {
        id: examId,
        title: "Exam",
        module: { code: "CS4001" },
        waitingCount: 2,
        withheldCount: 1,
      },
    ]);

    await publishExam(2);
    // Hannah's mark waits for the hold to be lifted, with nothing to publish.
    expect(await listAssessmentsToPublish(staff)).toEqual([]);
    await expect(
      listAssessmentsToPublish(await sessionFor(AMELIA)),
    ).rejects.toMatchObject({ kind: "FORBIDDEN" });
  });
});

describe("PUT and DELETE /api/students/[studentNumber]/results/hold", () => {
  it("hides every result from the student, published ones too, with the reason", async () => {
    expect((await withhold(FEES)).status).toBe(200);

    expect((await read(AMELIA)).body).toEqual({
      studentNumber: "SMS-2025-0001",
      withheld: { since: NOW.toISOString(), reason: FEES },
      results: [],
    });
    // Staff still see everything.
    expect((await read()).body.results).toHaveLength(2);
  });

  it("records nothing when withheld again for the same reason", async () => {
    await withhold(FEES);
    expect((await withhold(FEES)).status).toBe(200);
    expect(
      await db().auditEvent.count({ where: { action: "results.withheld" } }),
    ).toBe(1);
  });

  it("keeps the original date when the reason changes", async () => {
    await withhold(FEES);
    vi.setSystemTime(new Date("2026-10-20T09:00:00.000Z"));
    await withhold("Academic misconduct investigation");

    expect((await read()).body.withheld).toEqual({
      since: NOW.toISOString(),
      reason: "Academic misconduct investigation",
    });
  });

  it("shows published marks again once lifted, but not unpublished ones", async () => {
    await withhold(FEES);
    expect((await lift()).status).toBe(200);

    const { body } = await read(AMELIA);
    expect(body.withheld).toBeNull();
    expect(marksOf(body)).toEqual([["Essay", 72]]);
  });

  it("needs a reason, and is for staff only", async () => {
    expect(await withhold(" ")).toMatchObject({
      status: 400,
      body: { errors: { reason: ["Give a reason"] } },
    });
    expect((await withhold(FEES, AMELIA)).status).toBe(403);
    expect((await lift(AMELIA)).status).toBe(403);
  });
});

describe("listResultsWorklist", () => {
  it("lists students with marks or a hold, marks to publish first, with their fees", async () => {
    const hannah = await createStudent({
      studentNumber: "SMS-2026-0005",
      fullName: "Hannah Kowalski",
      resultsWithheldAt: NOW,
      resultsWithheldReason: FEES,
    });
    await db().feeCharge.create({
      data: {
        studentId: hannah.id,
        academicYear: "2026/27",
        description: "Tuition fee 2026/27",
        amountPence: 1_195_000,
        dueDate: toDbDate("2026-10-09"),
      },
    });

    const items = await listResultsWorklist(await sessionFor(STAFF));

    // Oliver has neither marks nor a hold, so isn't listed.
    expect(items).toMatchObject([
      {
        studentNumber: "SMS-2025-0001",
        publishedCount: 1,
        unpublishedCount: 1,
        withheld: null,
        account: { standing: "NONE" },
      },
      {
        studentNumber: "SMS-2026-0005",
        publishedCount: 0,
        unpublishedCount: 0,
        withheld: { reason: FEES },
        account: { standing: "OVERDUE", overduePence: 1_195_000 },
      },
    ]);
  });

  it("is for staff only", async () => {
    await expect(
      listResultsWorklist(await sessionFor(AMELIA)),
    ).rejects.toMatchObject({
      kind: "FORBIDDEN",
    });
  });
});
