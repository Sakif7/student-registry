// Moving students on to a new academic year: GET and POST /api/progression.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as listToProgress,
  POST as moveOn,
} from "@/app/api/progression/route";
import { db } from "@/server/db";
import { countStillInEndedYears } from "@/server/services/progression";

import {
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

// 15 October 2026 in London: 2026/27 has begun.
const NOW = new Date("2026-10-15T11:00:00.000Z");
// Midnight on 1 September 2026 in London, when 2026/27 began.
const YEAR_START = "2026-08-31T23:00:00.000Z";

interface ListBody {
  to: string;
  listed: string;
  page: {
    total: number;
    items: {
      studentNumber: string;
      yearOfStudy: number;
      suggested: string;
      steps: { step: string; label: string }[];
    }[];
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const { id: programmeId } = await createProgramme({
    code: "BSC-CS",
    title: "BSc (Hons) Computer Science",
    years: 3,
    annualFeePence: 953_500,
  });
  for (const yearOfStudy of [1, 2, 3]) {
    await createModule({
      code: `CS${yearOfStudy + 3}001`,
      title: `Year ${yearOfStudy} core`,
      programmeId,
      yearOfStudy,
    });
  }
  const student = (
    studentNumber: string,
    yearOfStudy: number,
    overrides: Parameters<typeof createStudent>[0] = {},
  ) =>
    createStudent({
      studentNumber,
      fullName: `Student ${studentNumber}`,
      programmeId,
      academicYear: "2025/26",
      yearOfStudy,
      statusChanges: { create: { toStatus: "ENROLLED" } },
      ...overrides,
    });
  // Still in 2025/26: two in year 1, one in year 2, one in their final year.
  await student("SMS-2025-0001", 1);
  await student("SMS-2025-0002", 1);
  await student("SMS-2024-0001", 2);
  await student("SMS-2023-0001", 3);
  // Not listed: moved on already, and withdrawn.
  await student("SMS-2025-0003", 2, { academicYear: "2026/27" });
  await student("SMS-2025-0004", 1, { status: "WITHDRAWN" });
});

afterEach(() => {
  vi.useRealTimers();
});

async function list(query = "", session: Viewer | null = STAFF) {
  const response = await listToProgress(
    await apiRequest("GET", `/api/progression${query}`, { session }),
    routeContext({}),
  );
  return { status: response.status, body: await bodyOf<ListBody>(response) };
}

async function post(body: unknown, session: Viewer | null = STAFF) {
  const response = await moveOn(
    await apiRequest("POST", "/api/progression", { json: body, session }),
    routeContext({}),
  );
  return { status: response.status, body: await bodyOf(response) };
}

/** What the page sends back when moving students on: who it listed. */
async function listedFor(query = "") {
  return (await list(query)).body.listed;
}

const student = (studentNumber: string) =>
  db().student.findUniqueOrThrow({
    where: { studentNumber },
    include: {
      registrations: { include: { module: { select: { code: true } } } },
      feeCharges: true,
    },
  });

describe("GET /api/progression", () => {
  it("lists enrolled students still in an earlier year, with each one's next step", async () => {
    const { status, body } = await list();

    expect(status).toBe(200);
    expect(body.to).toBe("2026/27");
    expect(body.page.total).toBe(4);
    expect(
      body.page.items.map(({ studentNumber, suggested, steps }) => [
        studentNumber,
        suggested,
        steps.map(({ label }) => label),
      ]),
    ).toEqual([
      ["SMS-2025-0001", "next", ["Year 2", "Repeat year 1", "Leave for now"]],
      ["SMS-2025-0002", "next", ["Year 2", "Repeat year 1", "Leave for now"]],
      ["SMS-2024-0001", "next", ["Year 3", "Repeat year 2", "Leave for now"]],
      [
        "SMS-2023-0001",
        "complete",
        ["Complete", "Repeat year 3", "Leave for now"],
      ],
    ]);
  });

  it("narrows the list by search, programme and year of study", async () => {
    expect((await list("?year=1")).body.page.total).toBe(2);
    expect((await list("?q=2024-0001")).body.page.items).toMatchObject([
      { studentNumber: "SMS-2024-0001" },
    ]);
    expect((await list("?programme=MSC-DS")).body.page.total).toBe(0);
  });

  it("is for staff only", async () => {
    expect((await list("", asStudent("SMS-2025-0001"))).status).toBe(403);
  });
});

describe("POST /api/progression", () => {
  it("moves each student on with their step, or leaves them", async () => {
    const { status, body } = await post({
      to: "2026/27",
      listed: await listedFor(),
      steps: { "SMS-2025-0002": "repeat", "sms-2024-0001": "leave" },
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      outcome: {
        movedUp: 1,
        repeating: 1,
        completed: 1,
        left: 1,
        skipped: 0,
      },
    });

    // Up a year: into 2026/27's year 2, its core module counted from the
    // year's start, and charged the year's fee.
    const up = await student("SMS-2025-0001");
    expect(up).toMatchObject({ academicYear: "2026/27", yearOfStudy: 2 });
    expect(
      up.registrations.map(({ module, academicYear, registeredAt }) => [
        module.code,
        academicYear,
        registeredAt.toISOString(),
      ]),
    ).toEqual([["CS5001", "2026/27", YEAR_START]]);
    expect(up.feeCharges).toMatchObject([
      { academicYear: "2026/27", amountPence: 953_500 },
    ]);

    // Repeating: 2026/27's year 1 again.
    expect(await student("SMS-2025-0002")).toMatchObject({
      academicYear: "2026/27",
      yearOfStudy: 1,
      registrations: [{ module: { code: "CS4001" } }],
    });
    // Left for now, and completed in their final year, 2025/26.
    expect(await student("SMS-2024-0001")).toMatchObject({
      academicYear: "2025/26",
      yearOfStudy: 2,
      status: "ENROLLED",
    });
    expect(await student("SMS-2023-0001")).toMatchObject({
      academicYear: "2025/26",
      status: "COMPLETED",
    });

    // Every change is in the audit trail, the year's from and to included.
    const { id } = up;
    expect(
      (
        await db().auditEvent.findMany({
          where: { studentId: id },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        })
      ).map(({ action, details }) => [action, details]),
    ).toEqual([
      [
        "student.edited",
        {
          fields: ["academicYear", "yearOfStudy"],
          changes: {
            academicYear: { from: "2025/26", to: "2026/27" },
            yearOfStudy: { from: 1, to: 2 },
          },
        },
      ],
      [
        "registration.added",
        {
          moduleCode: "CS5001",
          moduleTitle: "Year 2 core",
          academicYear: "2026/27",
        },
      ],
      ["fee.charged", { academicYear: "2026/27", amountPence: 953_500 }],
    ]);

    // Only the student left is still to move on.
    expect((await list()).body.page.items).toMatchObject([
      { studentNumber: "SMS-2024-0001" },
    ]);
  });

  it("moves only the students the filters list", async () => {
    expect(
      await post({
        to: "2026/27",
        year: 1,
        listed: await listedFor("?year=1"),
      }),
    ).toMatchObject({ body: { outcome: { movedUp: 2 } } });
    expect((await list()).body.page.total).toBe(2);
  });

  it("moves no one if the students listed have changed since, even if their number hasn't", async () => {
    const listed = await listedFor();
    const changed = (now: number) => ({
      status: 409,
      body: {
        detail: `The students to move on have changed since you looked: there are now ${now}. Reload the page to check them, then move them on.`,
      },
    });
    // One leaves the list.
    await db().student.update({
      where: { studentNumber: "SMS-2025-0002" },
      data: { status: "WITHDRAWN" },
    });
    expect(await post({ to: "2026/27", listed })).toMatchObject(changed(3));
    // And another joins it: four again, but not the four listed.
    await db().student.update({
      where: { studentNumber: "SMS-2025-0003" },
      data: { academicYear: "2025/26" },
    });
    expect(await post({ to: "2026/27", listed })).toMatchObject(changed(4));
    expect((await list()).body.page.items).toMatchObject([
      { studentNumber: "SMS-2025-0001" },
      { studentNumber: "SMS-2024-0001" },
      { studentNumber: "SMS-2025-0003" },
      { studentNumber: "SMS-2023-0001" },
    ]);
    // Without saying who was listed, nobody moves either.
    expect(await post({ to: "2026/27" })).toMatchObject({
      status: 400,
      body: {
        errors: { listed: ["Reload the page to see who is to move on"] },
      },
    });
  });

  it("refuses a step that isn't open to a student, moving no one", async () => {
    expect(
      await post({
        to: "2026/27",
        listed: await listedFor(),
        steps: { "SMS-2023-0001": "next" },
      }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: {
          steps: ["SMS-2023-0001 can't go past their programme's final year"],
        },
      },
    });
    expect(
      await post({
        to: "2026/27",
        listed: await listedFor(),
        steps: { "SMS-2025-0001": "complete" },
      }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: {
          steps: ["SMS-2025-0001 can't complete before their final year"],
        },
      },
    });
    expect((await list()).body.page.total).toBe(4);
  });

  it("moves students on to this year, or next only from August", async () => {
    expect(
      await post({ to: "2027/28", listed: await listedFor() }),
    ).toMatchObject({
      status: 400,
      body: {
        errors: {
          to: ["Students can be moved on to 2026/27 just now, not 2027/28"],
        },
      },
    });

    // In August, both: those in 2025/26 can be moved on to 2026/27 early.
    vi.setSystemTime(new Date("2026-08-20T09:00:00.000Z"));
    expect((await list("?to=2026-27")).body).toMatchObject({
      to: "2026/27",
      page: { total: 4 },
    });
  });

  it("is for staff only", async () => {
    expect(
      (await post({ to: "2026/27", expected: 4 }, asStudent("SMS-2025-0001")))
        .status,
    ).toBe(403);
  });
});

describe("countStillInEndedYears", () => {
  it("counts the enrolled students the dashboard asks to move on", async () => {
    expect(await countStillInEndedYears(await sessionFor(STAFF))).toEqual({
      year: "2026/27",
      count: 4,
    });
  });
});
