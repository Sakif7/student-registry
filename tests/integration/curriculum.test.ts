// The curriculum, as staff set it up through the API: programmes and their
// structure (/api/programmes), the module catalogue (/api/modules) and the
// academic calendar (/api/academic-years).
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listAcademicYears } from "@/app/api/academic-years/route";
import {
  PUT as saveAcademicYear,
  PATCH as setStudentsChoose,
} from "@/app/api/academic-years/[year]/route";
import { PATCH as updateModule } from "@/app/api/modules/[code]/route";
import { POST as createModule } from "@/app/api/modules/route";
import { DELETE as removeModule } from "@/app/api/programmes/[code]/modules/[moduleCode]/route";
import { POST as addModule } from "@/app/api/programmes/[code]/modules/route";
import {
  GET as getProgramme,
  PATCH as updateProgramme,
} from "@/app/api/programmes/[code]/route";
import { POST as createProgramme } from "@/app/api/programmes/route";
import { db } from "@/server/db";
import { listModuleSummaries } from "@/server/services/curriculum";

import {
  createModule as makeModule,
  createProgramme as makeProgramme,
  createStudent,
  registerStudents,
} from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  routeContext,
  sessionFor,
  STAFF,
  type Viewer,
} from "../helpers/requests";

// 15 October 2026 in London: academic year 2026/27.
const NOW = new Date("2026-10-15T11:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Calls a route handler as a viewer, returning the status and body. */
async function call<Params extends Record<string, string>>(
  handler: (
    request: NextRequest,
    context: { params: Promise<Params> },
  ) => Promise<Response>,
  method: string,
  path: string,
  {
    json,
    params,
    session = STAFF,
  }: {
    json?: unknown;
    params?: Params;
    session?: Viewer | null;
  } = {},
) {
  const response = await handler(
    await apiRequest(method, path, { json, session }),
    // Routes without a dynamic segment ignore their params.
    routeContext(params ?? ({} as Params)),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
  };
}

const COMPUTING = {
  code: "bsc-cs",
  title: "BSc (Hons) Computer Science",
  annualFeePence: 953_500,
  years: 3,
  creditsPerYear: 120,
};

/** Actions recorded in the audit trail so far, oldest first. */
async function actions() {
  const events = await db().auditEvent.findMany({
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  return events.map(({ action, details }) => ({ action, details }));
}

describe("programmes", () => {
  it("are set up by staff, with their code in capitals", async () => {
    const created = await call(createProgramme, "POST", "/api/programmes", {
      json: COMPUTING,
    });

    expect(created).toMatchObject({
      status: 201,
      body: {
        programme: {
          code: "BSC-CS",
          years: 3,
          creditsPerYear: 120,
          enrolledCount: 0,
          structure: [
            { yearOfStudy: 1, modules: [] },
            { yearOfStudy: 2, modules: [] },
            { yearOfStudy: 3, modules: [] },
          ],
        },
      },
    });
    expect(await actions()).toEqual([
      {
        action: "programme.created",
        details: { code: "BSC-CS", title: "BSc (Hons) Computer Science" },
      },
    ]);
  });

  it("refuse a code already in use, and anyone but staff", async () => {
    await call(createProgramme, "POST", "/api/programmes", { json: COMPUTING });

    expect(
      await call(createProgramme, "POST", "/api/programmes", {
        json: COMPUTING,
      }),
    ).toMatchObject({
      status: 409,
      body: {
        errors: {
          code: ["There is already a programme with the code BSC-CS"],
        },
      },
    });
    await createStudent({ studentNumber: "SMS-2026-0001" });
    expect(
      (
        await call(createProgramme, "POST", "/api/programmes", {
          json: { ...COMPUTING, code: "BA-BM" },
          session: asStudent("SMS-2026-0001"),
        })
      ).status,
    ).toBe(403);
  });

  it("change their details, recording which changed", async () => {
    await makeProgramme({ code: "BSC-CS", annualFeePence: 953_500 });

    const changed = await call(
      updateProgramme,
      "PATCH",
      "/api/programmes/BSC-CS",
      {
        json: { annualFeePence: 975_000, years: 3 },
        params: { code: "bsc-cs" },
      },
    );

    expect(changed).toMatchObject({
      status: 200,
      body: { programme: { annualFeePence: 975_000 } },
    });
    expect(await actions()).toEqual([
      {
        action: "programme.edited",
        details: { code: "BSC-CS", fields: ["annualFeePence"] },
      },
    ]);
  });

  it("keep their length and credits fitting their modules and students", async () => {
    const programme = await makeProgramme({ code: "BSC-CS" });
    await makeModule({
      programmeId: programme.id,
      yearOfStudy: 2,
      credits: 60,
    });
    await createStudent({ programmeId: programme.id, yearOfStudy: 3 });
    const patch = (json: unknown) =>
      call(updateProgramme, "PATCH", "/api/programmes/BSC-CS", {
        json,
        params: { code: "BSC-CS" },
      });

    expect(await patch({ years: 1 })).toMatchObject({
      status: 409,
      body: {
        detail:
          "Year 2 still has modules. Remove them from the structure first.",
      },
    });
    expect(await patch({ years: 2 })).toMatchObject({
      status: 409,
      body: { detail: "A student on this programme is in year 3." },
    });
    expect(await patch({ creditsPerYear: 50 })).toMatchObject({
      status: 409,
      body: {
        detail: "Core modules in year 2 come to 60 credits, more than 50.",
      },
    });
  });
});

describe("a programme's structure", () => {
  beforeEach(async () => {
    await makeProgramme({ code: "BSC-CS", creditsPerYear: 120 });
    await makeModule({ code: "CS4001", title: "Programming", credits: 60 });
    await makeModule({ code: "CS4002", title: "Databases", credits: 60 });
    await makeModule({
      code: "AI4001",
      title: "Introduction to AI",
      credits: 15,
      semester: "SECOND",
    });
  });

  const add = (json: unknown) =>
    call(addModule, "POST", "/api/programmes/BSC-CS/modules", {
      json,
      params: { code: "BSC-CS" },
    });

  it("places modules in a year as core or optional, core first", async () => {
    await add({ moduleCode: "AI4001", yearOfStudy: 1, kind: "OPTIONAL" });
    await add({ moduleCode: "cs4001", yearOfStudy: 1, kind: "CORE" });

    const { body } = await call(getProgramme, "GET", "/api/programmes/BSC-CS", {
      params: { code: "BSC-CS" },
    });
    expect(body).toMatchObject({
      programme: {
        moduleCount: 2,
        structure: [
          {
            yearOfStudy: 1,
            coreCredits: 60,
            optionalCredits: 15,
            modules: [
              { code: "CS4001", kind: "CORE", credits: 60 },
              { code: "AI4001", kind: "OPTIONAL", semester: "SECOND" },
            ],
          },
          { yearOfStudy: 2, modules: [] },
          { yearOfStudy: 3, modules: [] },
        ],
      },
    });
  });

  it("refuses core modules worth more than a year carries, a year it lacks, and a module twice", async () => {
    await add({ moduleCode: "CS4001", yearOfStudy: 1, kind: "CORE" });
    await add({ moduleCode: "AI4001", yearOfStudy: 1, kind: "CORE" });

    expect(
      await add({ moduleCode: "CS4002", yearOfStudy: 1, kind: "CORE" }),
    ).toMatchObject({
      status: 409,
      body: {
        detail:
          "Core modules in year 1 would come to 135 credits, more than the 120 a year carries.",
      },
    });
    // CS4002 is worth 60: no student could ever take it as an option with
    // only 45 credits left.
    expect(
      await add({ moduleCode: "CS4002", yearOfStudy: 1, kind: "OPTIONAL" }),
    ).toMatchObject({
      status: 409,
      body: {
        detail:
          "An option in year 1 can be worth at most 45 credits: core modules take 75 of the 120 a year carries.",
      },
    });
    expect(
      await add({ moduleCode: "CS4002", yearOfStudy: 4, kind: "OPTIONAL" }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: { yearOfStudy: ["This programme has 3 years of study"] },
      },
    });
    expect(
      await add({ moduleCode: "CS4001", yearOfStudy: 2, kind: "OPTIONAL" }),
    ).toMatchObject({
      status: 409,
      body: { detail: "CS4001 is already part of this programme." },
    });
  });

  it("takes a module out, leaving students' registrations alone", async () => {
    await add({ moduleCode: "AI4001", yearOfStudy: 1, kind: "OPTIONAL" });
    const ai = await db().module.findUniqueOrThrow({
      where: { code: "AI4001" },
    });
    const student = await createStudent();
    await registerStudents(ai.id, [student.id]);

    const removed = await call(
      removeModule,
      "DELETE",
      "/api/programmes/BSC-CS/modules/AI4001",
      { params: { code: "BSC-CS", moduleCode: "ai4001" } },
    );

    expect(removed).toMatchObject({
      status: 200,
      body: { programme: { moduleCount: 0 } },
    });
    expect(await db().moduleRegistration.count()).toBe(1);
    expect(
      (
        await call(
          removeModule,
          "DELETE",
          "/api/programmes/BSC-CS/modules/AI4001",
          { params: { code: "BSC-CS", moduleCode: "AI4001" } },
        )
      ).status,
    ).toBe(404);
  });
});

describe("modules", () => {
  it("are set up by staff, and changed", async () => {
    const created = await call(createModule, "POST", "/api/modules", {
      json: {
        code: "cs4002",
        title: "Databases",
        credits: 30,
        semester: "FIRST",
      },
    });
    const changed = await call(updateModule, "PATCH", "/api/modules/CS4002", {
      json: { semester: "SECOND", title: "Databases" },
      params: { code: "CS4002" },
    });

    expect([created.status, changed.status]).toEqual([201, 204]);
    expect(
      await db().module.findUniqueOrThrow({ where: { code: "CS4002" } }),
    ).toMatchObject({ credits: 30, semester: "SECOND" });
    expect(await actions()).toEqual([
      {
        action: "module.created",
        details: { code: "CS4002", title: "Databases" },
      },
      {
        action: "module.edited",
        details: { code: "CS4002", fields: ["semester"] },
      },
    ]);
  });

  it("are listed for staff with their programmes, this year's students, and whether their credits can change", async () => {
    const programme = await makeProgramme({ code: "BSC-CS" });
    const algorithms = await makeModule({
      code: "CS4001",
      programmeId: programme.id,
    });
    const databases = await makeModule({
      code: "CS4002",
      programmeId: programme.id,
      kind: "OPTIONAL",
    });
    await makeModule({ code: "CS4006" });
    const [first, second] = [
      await createStudent({ programmeId: programme.id }),
      await createStudent({ programmeId: programme.id }),
    ];
    await registerStudents(databases.id, [first.id, second.id]);
    // Taken only last year: no students now, but the credits stay put.
    await registerStudents(algorithms.id, [first.id], "2025/26");

    const listed = await listModuleSummaries(await sessionFor(STAFF));

    expect(
      listed.map(({ code, programmes, registeredCount, creditsLocked }) => ({
        code,
        programmes: programmes.map(({ code: programmeCode, kind }) => ({
          programmeCode,
          kind,
        })),
        registeredCount,
        creditsLocked,
      })),
    ).toEqual([
      {
        code: "CS4001",
        programmes: [{ programmeCode: "BSC-CS", kind: "CORE" }],
        registeredCount: 0,
        creditsLocked: true,
      },
      {
        code: "CS4002",
        programmes: [{ programmeCode: "BSC-CS", kind: "OPTIONAL" }],
        registeredCount: 2,
        creditsLocked: true,
      },
      {
        code: "CS4006",
        programmes: [],
        registeredCount: 0,
        creditsLocked: false,
      },
    ]);
    // Last year's students, asked for.
    expect(
      (await listModuleSummaries(await sessionFor(STAFF), "2025/26")).map(
        ({ code, registeredCount }) => [code, registeredCount],
      ),
    ).toEqual([
      ["CS4001", 1],
      ["CS4002", 0],
      ["CS4006", 0],
    ]);
    await expect(
      listModuleSummaries(await sessionFor(asStudent(first.studentNumber))),
    ).rejects.toMatchObject({ kind: "FORBIDDEN" });
  });

  it("keep their credits once students are registered on them", async () => {
    const databases = await makeModule({ code: "CS4002", credits: 30 });
    await registerStudents(databases.id, [(await createStudent()).id]);

    expect(
      await call(updateModule, "PATCH", "/api/modules/CS4002", {
        json: { credits: 15 },
        params: { code: "CS4002" },
      }),
    ).toMatchObject({
      status: 409,
      body: {
        detail:
          "Students are registered on this module, so its credits can't change. Set up a new module instead.",
      },
    });
  });

  it("can't take a year's core modules beyond its credits", async () => {
    const programme = await makeProgramme({
      code: "BSC-CS",
      creditsPerYear: 120,
    });
    await makeModule({
      code: "CS4001",
      credits: 60,
      programmeId: programme.id,
    });
    await makeModule({
      code: "CS4002",
      credits: 30,
      programmeId: programme.id,
    });

    expect(
      await call(updateModule, "PATCH", "/api/modules/CS4002", {
        json: { credits: 90 },
        params: { code: "CS4002" },
      }),
    ).toMatchObject({
      status: 409,
      body: {
        detail:
          "Core modules in BSC-CS year 1 would come to 150 credits, more than the 120 a year carries.",
      },
    });
  });

  it("can't overfill a year with a credits change and a new core module at once", async () => {
    const programme = await makeProgramme({
      code: "BSC-CS",
      creditsPerYear: 120,
    });
    await makeModule({
      code: "CS4001",
      credits: 60,
      programmeId: programme.id,
    });
    await makeModule({
      code: "CS4002",
      credits: 30,
      programmeId: programme.id,
    });
    await makeModule({ code: "CS4003", credits: 30 });

    // Each fits on its own (105 and 120 credits); both would make 135.
    const [changed, added] = await Promise.all([
      call(updateModule, "PATCH", "/api/modules/CS4002", {
        json: { credits: 45 },
        params: { code: "CS4002" },
      }),
      call(addModule, "POST", "/api/programmes/BSC-CS/modules", {
        json: { moduleCode: "CS4003", yearOfStudy: 1, kind: "CORE" },
        params: { code: "BSC-CS" },
      }),
    ]);

    // Whichever comes first goes through (204 for the change, 201 for the
    // new module), and the other is refused.
    expect([
      [204, 409],
      [409, 201],
    ]).toContainEqual([changed.status, added.status]);
    const core = await db().programmeModule.findMany({
      where: { programme: { code: "BSC-CS" }, yearOfStudy: 1, kind: "CORE" },
      select: { module: { select: { credits: true } } },
    });
    expect(
      core.reduce((total, { module }) => total + module.credits, 0),
    ).toBeLessThanOrEqual(120);
  });
});

describe("academic years", () => {
  const SEMESTERS = {
    semester1Start: "2026-09-21",
    semester1End: "2027-01-22",
    semester2Start: "2027-02-01",
    semester2End: "2027-06-11",
  };
  const put = (year: string, json: unknown) =>
    call(saveAcademicYear, "PUT", `/api/academic-years/${year}`, {
      json,
      params: { year },
    });

  it("are set up with their semesters, then changed", async () => {
    const created = await put("2026-27", SEMESTERS);
    const changed = await put("2026-27", {
      ...SEMESTERS,
      studentsChooseModules: true,
    });
    // Saving the same again changes nothing, so records nothing.
    await put("2026-27", { ...SEMESTERS, studentsChooseModules: true });

    expect(created).toMatchObject({
      status: 200,
      body: {
        academicYear: {
          year: "2026/27",
          ...SEMESTERS,
          studentsChooseModules: false,
        },
      },
    });
    expect(changed.body).toMatchObject({
      academicYear: { studentsChooseModules: true },
    });
    expect(
      (await call(listAcademicYears, "GET", "/api/academic-years")).body,
    ).toMatchObject({ academicYears: [{ year: "2026/27" }] });
    expect(await actions()).toEqual([
      {
        action: "academic_year.saved",
        details: {
          year: "2026/27",
          created: true,
          studentsChooseModules: false,
        },
      },
      {
        action: "academic_year.saved",
        details: {
          year: "2026/27",
          created: false,
          studentsChooseModules: true,
        },
      },
    ]);
  });

  it("let students choose, or stop them, leaving the semester dates alone", async () => {
    const patch = (year: string, json: unknown) =>
      call(setStudentsChoose, "PATCH", `/api/academic-years/${year}`, {
        json,
        params: { year },
      });
    await put("2026-27", SEMESTERS);

    expect(
      await patch("2026-27", { studentsChooseModules: true }),
    ).toMatchObject({
      status: 200,
      body: {
        academicYear: { ...SEMESTERS, studentsChooseModules: true },
      },
    });
    await patch("2026-27", { studentsChooseModules: true });
    expect(
      (await patch("2027-28", { studentsChooseModules: true })).status,
    ).toBe(404);
    expect(await actions()).toEqual([
      expect.objectContaining({ action: "academic_year.saved" }),
      {
        action: "academic_year.choosing_changed",
        details: { year: "2026/27", studentsChooseModules: true },
      },
    ]);
  });

  it("keep what has passed, and record the dates a change moved", async () => {
    // On 15 October 2026, semester 1 has started.
    await put("2026-27", SEMESTERS);

    expect(
      await put("2026-27", { ...SEMESTERS, semester1Start: "2026-09-28" }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: {
          semester1Start: ["This date has passed, so it can't change"],
        },
      },
    });
    expect(
      await put("2026-27", { ...SEMESTERS, semester1End: "2026-10-14" }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: {
          semester1End: [
            "Choose today or later: a date can't move into the past",
          ],
        },
      },
    });
    expect(
      (await put("2026-27", { ...SEMESTERS, semester2End: "2027-06-18" }))
        .status,
    ).toBe(200);
    expect((await actions()).at(-1)).toEqual({
      action: "academic_year.saved",
      details: {
        year: "2026/27",
        created: false,
        studentsChooseModules: false,
        changes: { semester2End: { from: "2027-06-11", to: "2027-06-18" } },
      },
    });
  });

  it("can be set up after they end, but not let students choose then", async () => {
    const LAST_YEAR = {
      semester1Start: "2025-09-22",
      semester1End: "2026-01-23",
      semester2Start: "2026-02-02",
      semester2End: "2026-06-12",
    };
    expect(
      await put("2025-26", { ...LAST_YEAR, studentsChooseModules: true }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: {
          studentsChooseModules: [
            "2025/26 has ended, so students can't choose modules for it",
          ],
        },
      },
    });
    expect((await put("2025-26", LAST_YEAR)).status).toBe(200);

    const patch = (json: unknown) =>
      call(setStudentsChoose, "PATCH", "/api/academic-years/2025-26", {
        json,
        params: { year: "2025-26" },
      });
    expect(await patch({ studentsChooseModules: true })).toMatchObject({
      status: 409,
      body: {
        detail: "2025/26 has ended, so students can't choose modules for it.",
      },
    });
    // A switch left on can still be turned off.
    await db().academicYear.update({
      where: { year: "2025/26" },
      data: { studentsChooseModules: true },
    });
    expect((await patch({ studentsChooseModules: false })).status).toBe(200);
  });

  it("refuse semesters out of order or outside the year, and a year that isn't one", async () => {
    expect(
      await put("2026-27", { ...SEMESTERS, semester2Start: "2027-01-10" }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: { semester2Start: ["Start semester 2 after semester 1 ends"] },
      },
    });
    expect((await put("2026", SEMESTERS)).status).toBe(404);
    // The right shape, but 2026/28 doesn't follow on from 2026.
    expect((await put("2026-28", SEMESTERS)).status).toBe(404);
    // Years whose dates can't be written (they once answered 500).
    expect((await put("9999-00", SEMESTERS)).status).toBe(404);
    expect((await put("0998-99", SEMESTERS)).status).toBe(404);
  });
});
