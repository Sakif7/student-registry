// Publishing and withholding results: GET /api/students/{number}/results,
// POST .../results/publication, and PUT or DELETE .../results/hold.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DELETE as liftHold,
  PUT as putHold,
} from "@/app/api/students/[studentNumber]/results/hold/route";
import { POST as publish } from "@/app/api/students/[studentNumber]/results/publication/route";
import { GET as getResults } from "@/app/api/students/[studentNumber]/results/route";
import { toDbDate } from "@/domain/college-time";
import { db } from "@/server/db";
import { listResultsWorklist } from "@/server/services/results";
import type { Session } from "@/server/session";

import {
  createAssessment,
  createProgramme,
  createStudent,
} from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  STAFF,
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

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const programme = await createProgramme();
  const moduleId = (
    await db().module.create({
      data: { code: "CS4001", title: "Programming", programmeId: programme.id },
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

async function read(session: Session | null = STAFF) {
  const response = await getResults(
    apiRequest("GET", "/api/students/SMS-2025-0001/results", { session }),
    context,
  );
  return { status: response.status, body: await bodyOf<ResultsBody>(response) };
}

async function publishAll(session: Session | null = STAFF) {
  const response = await publish(
    apiRequest("POST", "/api/students/SMS-2025-0001/results/publication", {
      session,
    }),
    context,
  );
  return { status: response.status, body: await bodyOf(response) };
}

async function withhold(reason: string, session: Session | null = STAFF) {
  const response = await putHold(
    apiRequest("PUT", "/api/students/SMS-2025-0001/results/hold", {
      session,
      json: { reason },
    }),
    context,
  );
  return { status: response.status, body: await bodyOf(response) };
}

async function lift(session: Session | null = STAFF) {
  const response = await liftHold(
    apiRequest("DELETE", "/api/students/SMS-2025-0001/results/hold", {
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

    const items = await listResultsWorklist(STAFF);

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
    await expect(listResultsWorklist(AMELIA)).rejects.toMatchObject({
      kind: "FORBIDDEN",
    });
  });
});
