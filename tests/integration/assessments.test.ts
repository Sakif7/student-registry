// Setting and managing assessments: GET/POST /api/assessments,
// GET/PATCH /api/assessments/{id} and GET /api/modules.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as getAssessment,
  PATCH as updateAssessment,
} from "@/app/api/assessments/[assessmentId]/route";
import {
  GET as listAssessments,
  POST as createAssessment,
} from "@/app/api/assessments/route";
import { GET as listModules } from "@/app/api/modules/route";
import { db } from "@/server/db";
import { listProgrammeModules } from "@/server/services/assessments";

import {
  createAssessment as insertAssessment,
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
  sessionFor,
  STAFF,
  type Viewer,
} from "../helpers/requests";

// 12:00 BST on 15 October 2026.
const NOW = new Date("2026-10-15T11:00:00.000Z");
const UNKNOWN_ID = "0195f6b4-0000-7000-8000-000000000000";

interface Summary {
  id: string;
  title: string;
  state: string;
  deadline: string;
  closedAt: string | null;
  expectedCount: number;
  submittedCount: number;
  lateCount: number;
}

interface Detail extends Summary {
  module: { code: string };
  students: {
    studentNumber: string;
    fullName: string;
    status: string;
    expected: boolean;
    submission: { attempt: number; late: boolean } | null;
  }[];
}

let computingModuleId: string;
let amelia: { id: string };
let oliver: { id: string };
let hannah: { id: string };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const computing = await createProgramme({
    code: "BSC-CS",
    title: "BSc (Hons) Computer Science",
  });
  const data = await createProgramme({ code: "MSC-DS" });
  computingModuleId = (
    await createModule({
      code: "CS4001",
      title: "Programming Fundamentals",
      programmeId: computing.id,
    })
  ).id;
  await createModule({
    code: "DS7001",
    title: "Machine Learning",
    programmeId: data.id,
  });
  amelia = await createStudent({
    studentNumber: "SMS-2025-0001",
    fullName: "Amelia Hart",
    programmeId: computing.id,
  });
  oliver = await createStudent({
    studentNumber: "SMS-2026-0001",
    fullName: "Oliver Bennett",
    programmeId: computing.id,
  });
  hannah = await createStudent({
    studentNumber: "SMS-2026-0002",
    fullName: "Hannah Kowalski",
    programmeId: computing.id,
    status: "WITHDRAWN",
  });
  await createStudent({
    studentNumber: "SMS-2026-0003",
    fullName: "Liam O'Connor",
    programmeId: data.id,
  });
  // Hannah was registered before withdrawing.
  await registerStudents(computingModuleId, [amelia.id, oliver.id, hannah.id]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function create(body: unknown, session: Viewer | null = STAFF) {
  const response = await createAssessment(
    await apiRequest("POST", "/api/assessments", { json: body, session }),
    routeContext({}),
  );
  return { status: response.status, body: await bodyOf(response) };
}

async function update(
  id: string,
  body: unknown,
  session: Viewer | null = STAFF,
) {
  const response = await updateAssessment(
    await apiRequest("PATCH", `/api/assessments/${id}`, {
      json: body,
      session,
    }),
    routeContext({ assessmentId: id }),
  );
  return { status: response.status, body: await bodyOf(response) };
}

async function detail(id: string, session: Viewer | null = STAFF) {
  const response = await getAssessment(
    await apiRequest("GET", `/api/assessments/${id}`, { session }),
    routeContext({ assessmentId: id }),
  );
  return {
    status: response.status,
    body: await bodyOf<{ assessment: Detail }>(response),
  };
}

describe("POST /api/assessments", () => {
  it("sets an assessment, reading the deadline as London time", async () => {
    const { status, body } = await create({
      moduleCode: "CS4001",
      title: "Coursework 1: Algorithms",
      deadline: "2026-11-20T17:00",
    });

    expect(status).toBe(201);
    expect(body).toMatchObject({
      assessment: {
        title: "Coursework 1: Algorithms",
        module: { code: "CS4001", semester: "FIRST" },
        academicYear: "2026/27",
        deadline: "2026-11-20T17:00:00.000Z",
        closedAt: null,
        state: "OPEN",
        // Amelia and Oliver: Hannah, also registered, has withdrawn.
        expectedCount: 2,
        submittedCount: 0,
      },
    });

    // In British Summer Time, 17:00 in London is 16:00 UTC.
    const summer = await create({
      moduleCode: "CS4001",
      title: "Lab test",
      deadline: "2026-10-20T17:00",
    });
    expect(summer.body).toMatchObject({
      assessment: { deadline: "2026-10-20T16:00:00.000Z" },
    });
  });

  it("refuses a time the clocks skip, a past deadline and an unknown module", async () => {
    expect(
      await create({
        moduleCode: "CS4001",
        title: "Essay",
        deadline: "2027-03-28T01:30",
      }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: {
          deadline: [
            "The clocks go forward at that time, so it never happens. Choose another time.",
          ],
        },
      },
    });
    expect(
      await create({
        moduleCode: "CS4001",
        title: "Essay",
        deadline: "2026-10-15T11:59",
      }),
    ).toMatchObject({
      status: 400,
      body: { errors: { deadline: ["The deadline must be in the future"] } },
    });
    expect(
      await create({
        moduleCode: "XX9999",
        title: "Essay",
        deadline: "2026-11-20T17:00",
      }),
    ).toMatchObject({
      status: 400,
      body: { errors: { moduleCode: ["Choose a module from the list"] } },
    });
    expect(await db().assessment.count()).toBe(0);
  });

  it("is for staff only", async () => {
    const body = {
      moduleCode: "CS4001",
      title: "Essay",
      deadline: "2026-11-20T17:00",
    };
    expect((await create(body, asStudent("SMS-2025-0001"))).status).toBe(403);
    expect((await create(body, null)).status).toBe(401);
  });
});

describe("GET /api/assessments", () => {
  it("lists open assessments first, soonest deadline first, then the rest, latest first", async () => {
    const at = (iso: string) => new Date(iso);
    for (const [title, deadline, closedAt] of [
      ["Past, closed", "2026-10-01T16:00:00Z", "2026-10-08T09:00:00Z"],
      ["Past, still open", "2026-10-10T16:00:00Z", null],
      ["Due later", "2026-12-04T17:00:00Z", null],
      ["Due soon", "2026-10-20T16:00:00Z", null],
    ] as const) {
      await insertAssessment({
        title,
        moduleId: computingModuleId,
        deadline: at(deadline),
        closedAt: closedAt && at(closedAt),
      });
    }

    const response = await listAssessments(
      await apiRequest("GET", "/api/assessments", { session: STAFF }),
      routeContext({}),
    );
    const { assessments } = await bodyOf<{ assessments: Summary[] }>(response);

    expect(assessments.map(({ title, state }) => [title, state])).toEqual([
      ["Due soon", "OPEN"],
      ["Due later", "OPEN"],
      ["Past, still open", "ACCEPTING_LATE"],
      ["Past, closed", "CLOSED"],
    ]);
  });

  it("counts submissions from the students expected to submit", async () => {
    const assessment = await insertAssessment({
      moduleId: computingModuleId,
      deadline: new Date("2026-10-10T16:00:00Z"),
    });
    const { id: assessmentId } = assessment;
    await createSubmission({
      studentId: amelia.id,
      assessmentId,
      submittedAt: new Date("2026-10-09T12:00:00Z"),
    });
    await createSubmission({
      studentId: oliver.id,
      assessmentId,
      submittedAt: new Date("2026-10-11T12:00:00Z"),
    });
    // Hannah submitted, then withdrew, so is no longer expected to submit.
    await createSubmission({ studentId: hannah.id, assessmentId });

    const response = await listAssessments(
      await apiRequest("GET", "/api/assessments", { session: STAFF }),
      routeContext({}),
    );
    expect(await bodyOf<{ assessments: Summary[] }>(response)).toMatchObject({
      assessments: [{ expectedCount: 2, submittedCount: 2, lateCount: 1 }],
    });
  });

  it("is for staff only", async () => {
    const response = await listAssessments(
      await apiRequest("GET", "/api/assessments", {
        session: asStudent("SMS-2025-0001"),
      }),
      routeContext({}),
    );
    expect(response.status).toBe(403);
  });
});

describe("GET /api/assessments/[assessmentId]", () => {
  it("tracks who has submitted, flagging late work", async () => {
    const { id } = await insertAssessment({
      moduleId: computingModuleId,
      deadline: new Date("2026-10-10T16:00:00Z"),
    });
    await createSubmission({
      studentId: amelia.id,
      assessmentId: id,
      attempt: 2,
      submittedAt: new Date("2026-10-09T12:00:00Z"),
    });
    await createSubmission({
      studentId: hannah.id,
      assessmentId: id,
      submittedAt: new Date("2026-10-12T12:00:00Z"),
    });

    const { status, body } = await detail(id);

    expect(status).toBe(200);
    // Liam's programme doesn't include the module, so Liam isn't listed.
    expect(body.assessment.students).toMatchObject([
      {
        studentNumber: "SMS-2025-0001",
        status: "ENROLLED",
        submission: { attempt: 2, late: false },
      },
      {
        studentNumber: "SMS-2026-0002",
        status: "WITHDRAWN",
        submission: { attempt: 1, late: true },
      },
      { studentNumber: "SMS-2026-0001", submission: null },
    ]);
  });

  it("counts the students due at the deadline, not those who left before it or joined after it", async () => {
    const { id } = await insertAssessment({
      moduleId: computingModuleId,
      deadline: new Date("2026-10-10T16:00:00Z"),
    });
    // Enrolled at the deadline and withdrew two days later: still due.
    const ava = await createStudent({
      fullName: "Ava Shah",
      status: "WITHDRAWN",
    });
    await db().enrolmentStatusChange.createMany({
      data: [
        {
          studentId: ava.id,
          toStatus: "ENROLLED",
          changedAt: new Date("2026-09-14T09:00:00Z"),
        },
        {
          studentId: ava.id,
          fromStatus: "ENROLLED",
          toStatus: "WITHDRAWN",
          reason: "Personal reasons",
          changedAt: new Date("2026-10-12T09:00:00Z"),
        },
      ],
    });
    await registerStudents(computingModuleId, [ava.id]);
    // Joined the module three days after the deadline, then submitted.
    const ben = await createStudent({ fullName: "Ben Carter" });
    await db().moduleRegistration.create({
      data: {
        studentId: ben.id,
        moduleId: computingModuleId,
        academicYear: "2026/27",
        registeredAt: new Date("2026-10-13T09:00:00Z"),
      },
    });
    await createSubmission({
      studentId: ben.id,
      assessmentId: id,
      submittedAt: new Date("2026-10-14T09:00:00Z"),
    });

    const { assessment } = (await detail(id)).body;
    // Amelia, Ava and Oliver. Hannah had withdrawn before the deadline.
    expect(assessment).toMatchObject({ expectedCount: 3, submittedCount: 0 });
    expect(
      assessment.students.map(({ fullName, expected }) => [fullName, expected]),
    ).toEqual([
      ["Amelia Hart", true],
      ["Ava Shah", true],
      ["Ben Carter", false],
      ["Oliver Bennett", true],
    ]);
  });

  it("404s for an unknown or malformed ID, and is for staff only", async () => {
    expect((await detail(UNKNOWN_ID)).status).toBe(404);
    expect((await detail("not-an-id")).status).toBe(404);
    const { id } = await insertAssessment({ moduleId: computingModuleId });
    expect((await detail(id, asStudent("SMS-2025-0001"))).status).toBe(403);
  });
});

describe("PATCH /api/assessments/[assessmentId]", () => {
  it("closes an assessment to submissions and reopens it", async () => {
    const { id } = await insertAssessment({ moduleId: computingModuleId });

    const closed = await update(id, { closed: true });
    expect(closed).toMatchObject({
      status: 200,
      body: {
        assessment: { state: "CLOSED", closedAt: "2026-10-15T11:00:00.000Z" },
      },
    });

    // Closing again keeps the time it was first closed.
    vi.setSystemTime(new Date("2026-10-16T09:00:00.000Z"));
    expect((await update(id, { closed: true })).body).toMatchObject({
      assessment: { closedAt: "2026-10-15T11:00:00.000Z" },
    });

    expect((await update(id, { closed: false })).body).toMatchObject({
      assessment: { state: "OPEN", closedAt: null },
    });
  });

  it("moves the deadline, and late flags follow it", async () => {
    const { id } = await insertAssessment({
      moduleId: computingModuleId,
      deadline: new Date("2026-10-10T16:00:00Z"),
    });
    await createSubmission({
      studentId: amelia.id,
      assessmentId: id,
      submittedAt: new Date("2026-10-12T12:00:00Z"),
    });
    expect((await detail(id)).body.assessment).toMatchObject({
      state: "ACCEPTING_LATE",
      lateCount: 1,
    });

    const { status, body } = await update(id, {
      deadline: "2026-10-30T17:00",
      title: "Coursework 1 (extended)",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      assessment: {
        title: "Coursework 1 (extended)",
        deadline: "2026-10-30T17:00:00.000Z",
        state: "OPEN",
        lateCount: 0,
        students: [{ submission: { late: false } }, { submission: null }],
      },
    });
  });

  it("keeps a moved deadline within the assessment's academic year", async () => {
    // Due 20 November 2026, so for 2026/27's students.
    const { id } = await insertAssessment({ moduleId: computingModuleId });
    expect(await update(id, { deadline: "2027-09-01T17:00" })).toMatchObject({
      status: 400,
      body: {
        errors: {
          deadline: [
            "Keep the deadline within 2026/27, by 31 Aug 2027: the assessment is for that year's students. For another year, set a new assessment.",
          ],
        },
      },
    });
    expect((await update(id, { deadline: "2027-08-31T17:00" })).status).toBe(
      200,
    );
  });

  it("refuses an empty change, a past deadline, an unknown ID and non-staff", async () => {
    const { id } = await insertAssessment({ moduleId: computingModuleId });
    expect(await update(id, {})).toMatchObject({
      status: 400,
      body: { detail: "Nothing to update" },
    });
    expect(await update(id, { deadline: "2026-10-01T09:00" })).toMatchObject({
      status: 400,
      body: { errors: { deadline: ["The deadline must be in the future"] } },
    });
    expect((await update(UNKNOWN_ID, { closed: true })).status).toBe(404);
    expect(
      (await update(id, { closed: true }, asStudent("SMS-2025-0001"))).status,
    ).toBe(403);
  });
});

describe("GET /api/modules", () => {
  it("lists each module with when it is taught, for any viewer", async () => {
    const response = await listModules(
      await apiRequest("GET", "/api/modules", {
        session: asStudent("SMS-2025-0001"),
      }),
      routeContext({}),
    );
    expect(await bodyOf(response)).toMatchObject({
      modules: [
        {
          code: "CS4001",
          title: "Programming Fundamentals",
          semester: "FIRST",
        },
        { code: "DS7001", title: "Machine Learning", semester: "FIRST" },
      ],
    });
  });
});

describe("listProgrammeModules", () => {
  it("lists each programme's modules, year by year, for staff setting an assessment", async () => {
    // A second-year option in BSC-CS that MSC-DS shares, in its first year.
    const [computing, data] = await Promise.all(
      ["BSC-CS", "MSC-DS"].map((code) =>
        db().programme.findUniqueOrThrow({ where: { code } }),
      ),
    );
    const shared = await createModule({
      code: "CS5005",
      title: "Data Mining",
      programmeId: computing?.id,
      yearOfStudy: 2,
      kind: "OPTIONAL",
    });
    await db().programmeModule.create({
      data: {
        programmeId: data?.id ?? "",
        moduleId: shared.id,
        yearOfStudy: 1,
        kind: "OPTIONAL",
      },
    });

    const programmes = await listProgrammeModules(await sessionFor(STAFF));

    expect(programmes.find(({ code }) => code === "BSC-CS")).toMatchObject({
      title: "BSc (Hons) Computer Science",
      modules: [
        { code: "CS4001", yearOfStudy: 1, kind: "CORE", semester: "FIRST" },
        { code: "CS5005", yearOfStudy: 2, kind: "OPTIONAL" },
      ],
    });
    expect(
      programmes
        .find(({ code }) => code === "MSC-DS")
        ?.modules.map(({ code }) => code),
    ).toEqual(["CS5005", "DS7001"]);
    await expect(
      listProgrammeModules(await sessionFor(asStudent("SMS-2025-0001"))),
    ).rejects.toMatchObject({ kind: "FORBIDDEN" });
  });
});
