// Editing a student's details (PATCH /api/students/{id}) and changing their
// enrolment status (POST /api/students/{id}/status).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH as updateStudent } from "@/app/api/students/[studentNumber]/route";
import { POST as changeStatus } from "@/app/api/students/[studentNumber]/status/route";

import { createProgramme, createStudent } from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  STAFF,
  type Viewer,
} from "../helpers/requests";

const NUMBER = "SMS-2026-0001";

interface StudentBody {
  student: {
    studentNumber: string;
    fullName: string;
    email: string;
    academicYear: string;
    status: string;
    programme: { code: string };
    statusHistory: { from: string | null; to: string; reason: string | null }[];
    allowedStatusChanges: string[];
  };
}

async function patch(
  body: unknown,
  session: Viewer | null = STAFF,
  number = NUMBER,
) {
  return updateStudent(
    await apiRequest("PATCH", `/api/students/${number}`, {
      json: body,
      session,
    }),
    routeContext({ studentNumber: number }),
  );
}

async function setStatus(body: unknown, session: Viewer | null = STAFF) {
  return changeStatus(
    await apiRequest("POST", `/api/students/${NUMBER}/status`, {
      json: body,
      session,
    }),
    routeContext({ studentNumber: NUMBER }),
  );
}

beforeEach(async () => {
  // The academic years a record can move to, and what counts as a birth date
  // in the past, follow the date.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T09:00:00.000Z"));
  await createProgramme({ code: "MSC-DS" });
  await createStudent({
    studentNumber: NUMBER,
    fullName: "Oliver Bennett",
    email: "oliver.bennett@student.example",
    academicYear: "2026/27",
    statusChanges: { create: { toStatus: "ENROLLED" } },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PATCH /api/students/[studentNumber]", () => {
  it("edits details but never the student number", async () => {
    const response = await patch({
      fullName: "Oliver J. Bennett",
      email: "Oliver.J.Bennett@Student.Example",
      programmeCode: "MSC-DS",
      academicYear: "2027/28",
    });

    expect(response.status).toBe(200);
    expect((await bodyOf<StudentBody>(response)).student).toMatchObject({
      studentNumber: NUMBER,
      fullName: "Oliver J. Bennett",
      email: "oliver.j.bennett@student.example",
      programme: { code: "MSC-DS" },
      academicYear: "2027/28",
    });
  });

  it("refuses an email another student already uses", async () => {
    await createStudent({ email: "taken@student.example" });
    const response = await patch({ email: "TAKEN@student.example" });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      errors: { email: ["Another student already uses this email address"] },
    });
  });

  it("rejects an empty update and invalid values", async () => {
    expect(await bodyOf(await patch({}))).toMatchObject({
      status: 400,
      detail: "Nothing to update",
    });
    expect(
      await bodyOf(await patch({ dateOfBirth: "2030-01-01" })),
    ).toMatchObject({
      errors: { dateOfBirth: ["The date of birth must be in the past"] },
    });
  });

  it("moves a record up to three academic years back, or keeps an older one", async () => {
    const tooOld = await patch({ academicYear: "2022/23" });
    expect(tooOld.status).toBe(400);
    expect(await bodyOf(tooOld)).toMatchObject({
      errors: {
        academicYear: ["Choose an academic year from 2023/24 to 2027/28"],
      },
    });
    expect((await patch({ academicYear: "2028/29" })).status).toBe(400);
    expect((await patch({ academicYear: "2023/24" })).status).toBe(200);

    // The edit form sends every field, so an old record keeps its year.
    await createStudent({
      studentNumber: "SMS-2019-0001",
      academicYear: "2019/20",
    });
    expect(
      (
        await patch(
          { fullName: "Ada Long", academicYear: "2019/20" },
          STAFF,
          "SMS-2019-0001",
        )
      ).status,
    ).toBe(200);
  });

  it("is for staff only, and 404s for an unknown student", async () => {
    expect((await patch({ fullName: "X Y" }, asStudent(NUMBER))).status).toBe(
      403,
    );
    expect(
      (await patch({ fullName: "X Y" }, STAFF, "SMS-2026-0999")).status,
    ).toBe(404);
  });
});

describe("POST /api/students/[studentNumber]/status", () => {
  it("defers a student with a reason, recorded in the history", async () => {
    const response = await setStatus({
      status: "DEFERRED",
      reason: "Medical grounds",
    });

    expect(response.status).toBe(200);
    const { student } = await bodyOf<StudentBody>(response);
    expect(student.status).toBe("DEFERRED");
    expect(
      student.statusHistory.map((change) => [
        change.from,
        change.to,
        change.reason,
      ]),
    ).toEqual([
      [null, "ENROLLED", null],
      ["ENROLLED", "DEFERRED", "Medical grounds"],
    ]);
    expect(student.allowedStatusChanges).toEqual(["ENROLLED", "WITHDRAWN"]);
  });

  it("requires a reason to withdraw", async () => {
    const response = await setStatus({ status: "WITHDRAWN" });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: { reason: ["Give a reason for deferral or withdrawal"] },
    });
  });

  it("re-admits a withdrawn student", async () => {
    await setStatus({ status: "WITHDRAWN", reason: "Moved abroad" });
    const response = await setStatus({ status: "ENROLLED" });
    expect(response.status).toBe(200);
    expect((await bodyOf<StudentBody>(response)).student.status).toBe(
      "ENROLLED",
    );
  });

  it("refuses changes the rules don't allow, explaining why", async () => {
    expect(await bodyOf(await setStatus({ status: "ENROLLED" }))).toMatchObject(
      {
        status: 409,
        detail: "The student is already Enrolled.",
      },
    );

    await setStatus({ status: "COMPLETED" });
    expect(await bodyOf(await setStatus({ status: "ENROLLED" }))).toMatchObject(
      {
        status: 409,
        detail: "A Completed record is final; its status can't change.",
      },
    );
  });

  it("lets only one of two simultaneous changes win", async () => {
    // Sign in for both first, so the two changes really run side by side.
    const requests = await Promise.all(
      [
        { status: "DEFERRED", reason: "Medical grounds" },
        { status: "WITHDRAWN", reason: "Moved abroad" },
      ].map((json) =>
        apiRequest("POST", `/api/students/${NUMBER}/status`, {
          json,
          session: STAFF,
        }),
      ),
    );
    const [first, second] = await Promise.all(
      requests.map((request) =>
        changeStatus(request, routeContext({ studentNumber: NUMBER })),
      ),
    );

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    const { detail } = await bodyOf<{ detail: string }>(loser);
    expect(detail).toMatch(/already|changed this student.s status/);
  });

  it("is for staff only", async () => {
    expect(
      (await setStatus({ status: "DEFERRED", reason: "x" }, asStudent(NUMBER)))
        .status,
    ).toBe(403);
  });
});
