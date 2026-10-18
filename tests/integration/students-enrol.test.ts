// Enrolling students through POST /api/students, and reading records back.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getProgrammes } from "@/app/api/programmes/route";
import { GET as getStudent } from "@/app/api/students/[studentNumber]/route";
import { POST as enrolStudent } from "@/app/api/students/route";

import { createProgramme, createStudent } from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  STAFF,
  type Viewer,
} from "../helpers/requests";

interface StudentBody {
  student: {
    studentNumber: string;
    fullName: string;
    email: string;
    status: string;
    statusHistory: { from: string | null; to: string }[];
  };
}

function details(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Amelia Hart",
    email: "amelia.hart@student.example",
    dateOfBirth: "2004-05-17",
    programmeCode: "BSC-CS",
    academicYear: "2026/27",
    ...overrides,
  };
}

async function enrol(body: unknown, session: Viewer | null = STAFF) {
  return enrolStudent(
    await apiRequest("POST", "/api/students", { json: body, session }),
    routeContext({}),
  );
}

async function enrolledNumber(body: unknown): Promise<string> {
  const response = await enrol(body);
  expect(response.status).toBe(201);
  return (await bodyOf<StudentBody>(response)).student.studentNumber;
}

beforeEach(async () => {
  // The academic years a student can be enrolled into follow the date.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T09:00:00.000Z"));
  await createProgramme({
    code: "BSC-CS",
    title: "BSc (Hons) Computer Science",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/students", () => {
  it("enrols a student with the first number of their intake year", async () => {
    const response = await enrol(
      details({
        fullName: "  Amelia   Hart ",
        email: "Amelia.Hart@Student.Example",
      }),
    );

    expect(response.status).toBe(201);
    const { student } = await bodyOf<StudentBody>(response);
    expect(student).toMatchObject({
      studentNumber: "SMS-2026-0001",
      fullName: "Amelia Hart",
      email: "amelia.hart@student.example",
      status: "ENROLLED",
      statusHistory: [{ from: null, to: "ENROLLED" }],
    });
  });

  it("numbers students in order within a year and restarts for each intake year", async () => {
    expect(await enrolledNumber(details({ email: "a@student.example" }))).toBe(
      "SMS-2026-0001",
    );
    expect(await enrolledNumber(details({ email: "b@student.example" }))).toBe(
      "SMS-2026-0002",
    );
    expect(
      await enrolledNumber(
        details({ email: "c@student.example", academicYear: "2025/26" }),
      ),
    ).toBe("SMS-2025-0001");
  });

  it("gives concurrent enrolments unique numbers with no gaps", async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        enrol(details({ email: `student${i}@student.example` })),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 20 }, () => 201),
    );
    const numbers = await Promise.all(
      responses.map(
        async (response) =>
          (await bodyOf<StudentBody>(response)).student.studentNumber,
      ),
    );
    expect(numbers.sort()).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => `SMS-2026-${String(i + 1).padStart(4, "0")}`,
      ),
    );
  });

  it("doesn't use up a number when an enrolment fails", async () => {
    expect(await enrolledNumber(details())).toBe("SMS-2026-0001");
    expect((await enrol(details({ fullName: "Someone Else" }))).status).toBe(
      409,
    );
    expect(
      await enrolledNumber(details({ email: "next@student.example" })),
    ).toBe("SMS-2026-0002");
  });

  it("refuses an email another student already uses, whatever its case", async () => {
    await enrolledNumber(details());
    const response = await enrol(
      details({ email: "AMELIA.HART@student.example" }),
    );

    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      errors: { email: ["Another student already uses this email address"] },
    });
  });

  it("explains invalid details field by field", async () => {
    const response = await enrol(
      details({
        fullName: "A",
        dateOfBirth: "2040-01-01",
        academicYear: "2026/28",
      }),
    );

    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: {
        fullName: ["Enter at least 2 characters"],
        dateOfBirth: ["The date of birth must be in the past"],
        academicYear: ["Use the format 2026/27, with consecutive years"],
      },
    });
  });

  it("enrols into last academic year, this one or next, and no other", async () => {
    expect(
      await enrolledNumber(
        details({ email: "next@student.example", academicYear: "2027/28" }),
      ),
    ).toBe("SMS-2027-0001");
    for (const academicYear of ["2024/25", "2028/29"]) {
      const response = await enrol(details({ academicYear }));

      expect(response.status).toBe(400);
      expect(await bodyOf(response)).toMatchObject({
        errors: {
          academicYear: ["Choose an academic year from 2025/26 to 2027/28"],
        },
      });
    }
  });

  it("refuses an unknown programme", async () => {
    const response = await enrol(details({ programmeCode: "PHD-ART" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: { programmeCode: ["Choose a programme from the list"] },
    });
  });

  it("lets a record start as Deferred but not as Completed", async () => {
    const deferred = await enrol(details({ status: "DEFERRED" }));
    expect(deferred.status).toBe(201);
    expect((await bodyOf<StudentBody>(deferred)).student.status).toBe(
      "DEFERRED",
    );

    const completed = await enrol(
      details({ email: "x@student.example", status: "COMPLETED" }),
    );
    expect(completed.status).toBe(400);
  });

  it("only lets staff enrol students", async () => {
    await createStudent({ studentNumber: "SMS-2024-0099" });
    expect((await enrol(details(), asStudent("SMS-2024-0099"))).status).toBe(
      403,
    );
    expect((await enrol(details(), null)).status).toBe(401);
  });
});

describe("GET /api/students/[studentNumber]", () => {
  async function read(studentNumber: string, session: Viewer | null) {
    return getStudent(
      await apiRequest("GET", `/api/students/${studentNumber}`, { session }),
      routeContext({ studentNumber }),
    );
  }

  it("shows a record to staff and to the student themselves, not to others", async () => {
    const number = await enrolledNumber(details());

    expect((await read(number, STAFF)).status).toBe(200);
    expect((await read(number, asStudent(number))).status).toBe(200);
    await createStudent({ studentNumber: "SMS-2024-0099" });
    expect((await read(number, asStudent("SMS-2024-0099"))).status).toBe(403);
    expect((await read(number, null)).status).toBe(401);
  });

  it("accepts the student ID in any case", async () => {
    const number = await enrolledNumber(details());
    expect((await read(number.toLowerCase(), STAFF)).status).toBe(200);
  });

  it("returns 404 for an unknown student", async () => {
    const response = await read("SMS-2026-0404", STAFF);
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({
      detail: "There is no student with ID SMS-2026-0404.",
    });
  });
});

describe("GET /api/programmes", () => {
  it("lists programmes for anyone with a session", async () => {
    const response = await getProgrammes(
      await apiRequest("GET", "/api/programmes", { session: STAFF }),
      routeContext({}),
    );
    expect(await bodyOf(response)).toEqual({
      programmes: [
        {
          code: "BSC-CS",
          title: "BSc (Hons) Computer Science",
          annualFeePence: 953_500,
          years: 3,
        },
      ],
    });
    expect(
      (
        await getProgrammes(
          await apiRequest("GET", "/api/programmes"),
          routeContext({}),
        )
      ).status,
    ).toBe(401);
  });
});
