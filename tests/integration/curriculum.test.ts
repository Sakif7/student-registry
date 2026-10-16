// The curriculum, as staff set it up through the API: programmes and their
// structure (/api/programmes), the module catalogue (/api/modules) and the
// academic calendar (/api/academic-years).
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as listAcademicYears } from "@/app/api/academic-years/route";
import { PUT as saveAcademicYear } from "@/app/api/academic-years/[year]/route";
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
  });
});
