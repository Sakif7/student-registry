// Module registration: GET, POST and DELETE /api/students/{number}/modules,
// and the registration that enrolment, status changes and moving year bring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as dropModule } from "@/app/api/students/[studentNumber]/modules/[moduleCode]/route";
import {
  GET as getModules,
  POST as registerOnModule,
} from "@/app/api/students/[studentNumber]/modules/route";
import { toDbDate } from "@/domain/college-time";
import { DROP_REFUSED_WITHOUT_REASON } from "@/domain/registration";
import { db } from "@/server/db";
import {
  changeStatus,
  createStudent,
  updateStudent,
} from "@/server/services/students";

import {
  createAssessment,
  createModule,
  createProgramme,
  createStudent as makeStudent,
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

// 15 October 2026 in London: academic year 2026/27.
const NOW = new Date("2026-10-15T11:00:00.000Z");
const YEAR = "2026/27";

interface ModulesBody {
  modules: {
    registeredCredits: number;
    changes: { allowed: boolean; message?: string };
    registered: {
      code: string;
      kind: string | null;
      hasWork: boolean;
      drop: { allowed: boolean; message?: string };
    }[];
    options: { code: string; fits: boolean }[];
  };
}

let programmeId: string;
const moduleIds: Record<string, string> = {};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  programmeId = (
    await createProgramme({
      code: "BSC-CS",
      title: "BSc (Hons) Computer Science",
      years: 3,
      creditsPerYear: 120,
    })
  ).id;
  // Year 1: 90 core credits, and 60 of options for the remaining 30.
  // Year 2: one core module.
  for (const [code, credits, yearOfStudy, kind] of [
    ["CS4001", 60, 1, "CORE"],
    ["CS4002", 30, 1, "CORE"],
    ["CS4004", 15, 1, "OPTIONAL"],
    ["AI4001", 15, 1, "OPTIONAL"],
    ["CS4005", 30, 1, "OPTIONAL"],
    ["CS5001", 60, 2, "CORE"],
  ] as const) {
    moduleIds[code] = (
      await createModule({
        code,
        title: `Module ${code}`,
        credits,
        programmeId,
        yearOfStudy,
        kind,
      })
    ).id;
  }
});

afterEach(() => {
  vi.useRealTimers();
});

/** Enrols a student through the service, as the enrolment form does. */
async function enrol(
  overrides: { yearOfStudy?: number; status?: "ENROLLED" | "DEFERRED" } = {},
) {
  return createStudent(await sessionFor(STAFF), {
    fullName: "Oliver Bennett",
    email: "oliver.bennett@example.ac.uk",
    dateOfBirth: "2007-02-23",
    programmeCode: "BSC-CS",
    academicYear: YEAR,
    ...overrides,
  });
}

async function modules(studentNumber: string, session: Viewer = STAFF) {
  const response = await getModules(
    await apiRequest("GET", `/api/students/${studentNumber}/modules`, {
      session,
    }),
    routeContext({ studentNumber }),
  );
  return (await bodyOf<ModulesBody>(response)).modules;
}

async function register(
  studentNumber: string,
  moduleCode: string,
  session: Viewer = STAFF,
) {
  const response = await registerOnModule(
    await apiRequest("POST", `/api/students/${studentNumber}/modules`, {
      json: { moduleCode },
      session,
    }),
    routeContext({ studentNumber }),
  );
  return { status: response.status, body: await bodyOf(response) };
}

async function drop(
  studentNumber: string,
  moduleCode: string,
  session: Viewer = STAFF,
) {
  const response = await dropModule(
    await apiRequest(
      "DELETE",
      `/api/students/${studentNumber}/modules/${moduleCode}`,
      { session },
    ),
    routeContext({ studentNumber, moduleCode }),
  );
  return { status: response.status, body: await bodyOf(response) };
}

const codes = (list: readonly { code: string }[]) =>
  list.map(({ code }) => code);

describe("enrolment", () => {
  it("registers the student on their year's core modules", async () => {
    const { studentNumber } = await enrol();

    const registered = await modules(studentNumber);

    expect(codes(registered.registered)).toEqual(["CS4001", "CS4002"]);
    expect(registered.registeredCredits).toBe(90);
    expect(registered.options).toEqual([
      expect.objectContaining({ code: "AI4001", fits: true }),
      expect.objectContaining({ code: "CS4004", fits: true }),
      expect.objectContaining({ code: "CS4005", fits: true }),
    ]);
    expect(
      await db().auditEvent.count({ where: { action: "registration.added" } }),
    ).toBe(2);
  });

  it("refuses a year of study the programme doesn't have", async () => {
    await expect(enrol({ yearOfStudy: 4 })).rejects.toMatchObject({
      kind: "VALIDATION",
      fieldErrors: {
        yearOfStudy: ["BSc (Hons) Computer Science has 3 years of study"],
      },
    });
  });

  it("leaves a deferred entry unregistered until they return", async () => {
    const { studentNumber } = await enrol({ status: "DEFERRED" });
    expect((await modules(studentNumber)).registered).toEqual([]);

    await changeStatus(await sessionFor(STAFF), studentNumber, {
      status: "ENROLLED",
    });

    expect(codes((await modules(studentNumber)).registered)).toEqual([
      "CS4001",
      "CS4002",
    ]);
  });
});

describe("staff registering a student on modules", () => {
  it("add optional modules up to the year's credits", async () => {
    const { studentNumber } = await enrol();

    expect((await register(studentNumber, "cs4005")).status).toBe(201);
    expect(await register(studentNumber, "CS4004")).toMatchObject({
      status: 409,
      body: {
        detail:
          "That would make 135 credits this year, more than the 120 a year carries.",
      },
    });
    const now = await modules(studentNumber);
    expect(now.registeredCredits).toBe(120);
    expect(now.options).toEqual([
      expect.objectContaining({ code: "AI4001", fits: false }),
      expect.objectContaining({ code: "CS4004", fits: false }),
    ]);
  });

  it("refuse modules outside the student's year, twice, or for a student who isn't enrolled", async () => {
    const { studentNumber } = await enrol();

    expect(await register(studentNumber, "CS5001")).toMatchObject({
      status: 409,
      body: {
        detail:
          "This module isn't part of the programme in this year of study.",
      },
    });
    expect(await register(studentNumber, "CS4001")).toMatchObject({
      status: 409,
      body: { detail: "Already registered on this module this year." },
    });
    expect((await register(studentNumber, "NOPE1")).status).toBe(400);

    const deferred = await makeStudent({
      programmeId,
      status: "DEFERRED",
    });
    expect(await register(deferred.studentNumber, "AI4001")).toMatchObject({
      status: 409,
      body: { detail: "Only enrolled students can be registered on modules." },
    });
  });

  it("drop optional modules, but not core ones or ones with work", async () => {
    const { studentNumber } = await enrol();
    const student = await db().student.findUniqueOrThrow({
      where: { studentNumber },
    });
    await register(studentNumber, "AI4001");
    await register(studentNumber, "CS4004");
    const essay = await createAssessment({ moduleId: moduleIds.CS4004 });
    await createSubmission({ studentId: student.id, assessmentId: essay.id });

    expect((await drop(studentNumber, "ai4001")).status).toBe(200);
    expect(await drop(studentNumber, "CS4001")).toMatchObject({
      status: 409,
      body: {
        detail:
          "Core modules can't be dropped: every student in the year takes them.",
      },
    });
    expect(await drop(studentNumber, "CS4004")).toMatchObject({
      status: 409,
      body: {
        detail:
          "Work has been submitted or marked for this module, so it stays on the record.",
      },
    });
    expect((await drop(studentNumber, "AI4001")).status).toBe(404);
    expect(
      await db().auditEvent.count({
        where: { action: "registration.dropped" },
      }),
    ).toBe(1);
  });

  it("change nothing for a student who isn't enrolled, who keeps their modules", async () => {
    const { studentNumber } = await enrol();
    await register(studentNumber, "AI4001");
    await changeStatus(await sessionFor(STAFF), studentNumber, {
      status: "WITHDRAWN",
      reason: "Moved abroad",
    });

    expect(await drop(studentNumber, "AI4001")).toMatchObject({
      status: 409,
      body: { detail: "Only an enrolled student's modules can change." },
    });
    const kept = await modules(studentNumber);
    expect(codes(kept.registered)).toEqual(["AI4001", "CS4001", "CS4002"]);
    expect(kept.changes).toEqual({
      allowed: false,
      message: "Only an enrolled student's modules can change.",
    });
    expect(kept.registered.map(({ drop }) => drop.allowed)).toEqual([
      false,
      false,
      false,
    ]);
    expect(
      (await modules(studentNumber, asStudent(studentNumber))).changes,
    ).toEqual({
      allowed: false,
      message: "Your modules can only change while you are enrolled.",
    });
  });

  it("never let registrations made at once take the year past its credits", async () => {
    const { studentNumber } = await enrol();
    // 30 credits are left: CS4005 alone, or CS4004 and AI4001, fit. Signed
    // in first, so that the registrations themselves run together.
    const requests = await Promise.all(
      ["CS4005", "CS4004", "AI4001"].map((moduleCode) =>
        apiRequest("POST", `/api/students/${studentNumber}/modules`, {
          json: { moduleCode },
          session: STAFF,
        }),
      ),
    );

    const statuses = await Promise.all(
      requests.map(
        async (request) =>
          (await registerOnModule(request, routeContext({ studentNumber })))
            .status,
      ),
    );

    expect(statuses).toContain(409);
    expect(
      (await modules(studentNumber)).registeredCredits,
    ).toBeLessThanOrEqual(120);
  });
});

describe("students choosing their own modules", () => {
  async function openChoosing(open: boolean) {
    await db().academicYear.create({
      data: {
        year: YEAR,
        semester1Start: toDbDate("2026-09-21"),
        semester1End: toDbDate("2027-01-22"),
        semester2Start: toDbDate("2027-02-01"),
        semester2End: toDbDate("2027-06-11"),
        studentsChooseModules: open,
      },
    });
  }

  it("can't while their academic year doesn't let them", async () => {
    await openChoosing(false);
    const { studentNumber } = await enrol();
    const self = asStudent(studentNumber);

    expect((await modules(studentNumber, self)).changes).toEqual({
      allowed: false,
      message:
        "Choosing modules isn't open just now. Contact the Registry to change your modules.",
    });
    expect(await register(studentNumber, "AI4001", self)).toMatchObject({
      status: 403,
      body: {
        detail:
          "Choosing modules isn't open just now. Contact the Registry to change your modules.",
      },
    });
  });

  it("add and drop their own options while it does, but not core modules", async () => {
    await openChoosing(true);
    const { studentNumber } = await enrol();
    const self = asStudent(studentNumber);

    expect((await modules(studentNumber, self)).changes).toEqual({
      allowed: true,
    });
    expect((await register(studentNumber, "AI4001", self)).status).toBe(201);
    expect((await drop(studentNumber, "AI4001", self)).status).toBe(200);
    expect(await drop(studentNumber, "CS4001", self)).toMatchObject({
      status: 409,
    });
    expect(
      await db().auditEvent.findMany({
        where: {
          action: { startsWith: "registration." },
          actor: { role: "student" },
        },
        select: { action: true },
      }),
    ).toEqual([
      { action: "registration.added" },
      { action: "registration.dropped" },
    ]);
  });

  it("aren't told of a mark they can't see yet, even by a module they can't drop", async () => {
    await openChoosing(true);
    const { studentNumber } = await enrol();
    const student = await db().student.findUniqueOrThrow({
      where: { studentNumber },
    });
    const self = asStudent(studentNumber);
    await register(studentNumber, "AI4001", self);
    const test = await createAssessment({ moduleId: moduleIds.AI4001 });
    // Marked, without a submission, and not yet published.
    await db().assessmentResult.create({
      data: { studentId: student.id, assessmentId: test.id, mark: 55 },
    });

    const own = (await modules(studentNumber, self)).registered.find(
      ({ code }) => code === "AI4001",
    );
    expect(own).toMatchObject({
      hasWork: false,
      drop: { allowed: false, message: DROP_REFUSED_WITHOUT_REASON },
    });
    expect(await drop(studentNumber, "AI4001", self)).toMatchObject({
      status: 409,
      body: { detail: DROP_REFUSED_WITHOUT_REASON },
    });
    // Staff see why.
    expect(
      (await modules(studentNumber)).registered.find(
        ({ code }) => code === "AI4001",
      ),
    ).toMatchObject({ hasWork: true });
  });

  it("only ever their own", async () => {
    await openChoosing(true);
    const { studentNumber } = await enrol();
    const other = await makeStudent({ programmeId });

    expect(
      (await register(studentNumber, "AI4001", asStudent(other.studentNumber)))
        .status,
    ).toBe(403);
  });
});

describe("moving a student", () => {
  it("to another year re-registers them, keeping modules with work", async () => {
    const { studentNumber } = await enrol();
    const student = await db().student.findUniqueOrThrow({
      where: { studentNumber },
    });
    await register(studentNumber, "AI4001");
    const report = await createAssessment({ moduleId: moduleIds.CS4002 });
    await createSubmission({ studentId: student.id, assessmentId: report.id });

    await updateStudent(await sessionFor(STAFF), studentNumber, {
      yearOfStudy: 2,
    });

    const now = await modules(studentNumber);
    expect(codes(now.registered)).toEqual(["CS4002", "CS5001"]);
    // CS4002 isn't part of year 2: it stays only for the work.
    expect(now.registered[0]).toMatchObject({
      code: "CS4002",
      kind: null,
      drop: { allowed: false },
    });
  });

  it("to the next academic year starts its registrations afresh, keeping the old", async () => {
    const { studentNumber } = await enrol();

    await updateStudent(await sessionFor(STAFF), studentNumber, {
      academicYear: "2027/28",
      yearOfStudy: 2,
    });

    const response = await getModules(
      await apiRequest("GET", `/api/students/${studentNumber}/modules`, {
        session: STAFF,
      }),
      routeContext({ studentNumber }),
    );
    expect(await bodyOf(response)).toMatchObject({
      modules: {
        academicYear: "2027/28",
        registered: [{ code: "CS5001" }],
        history: [
          {
            academicYear: YEAR,
            modules: [{ code: "CS4001" }, { code: "CS4002" }],
          },
        ],
      },
    });
  });

  it("forward a year by mistake and back leaves nothing in the later year", async () => {
    const { studentNumber } = await enrol();
    const staff = await sessionFor(STAFF);

    await updateStudent(staff, studentNumber, {
      academicYear: "2027/28",
      yearOfStudy: 2,
    });
    await updateStudent(staff, studentNumber, {
      academicYear: YEAR,
      yearOfStudy: 1,
    });

    expect(
      await db().moduleRegistration.count({
        where: { student: { studentNumber }, academicYear: "2027/28" },
      }),
    ).toBe(0);
    const response = await getModules(
      await apiRequest("GET", `/api/students/${studentNumber}/modules`, {
        session: STAFF,
      }),
      routeContext({ studentNumber }),
    );
    expect(await bodyOf(response)).toMatchObject({
      modules: { academicYear: YEAR, history: [] },
    });
  });

  it("is registered for the module's year only, so other years' assessments aren't theirs", async () => {
    const student = await makeStudent({ programmeId });
    await registerStudents(moduleIds.CS4001, [student.id], "2025/26");

    expect((await modules(student.studentNumber)).registered).toEqual([]);
  });
});
