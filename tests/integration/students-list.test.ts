// Searching, filtering and paging students through GET /api/students.
import { beforeEach, describe, expect, it } from "vitest";

import { GET as listStudents } from "@/app/api/students/route";
import type { Session } from "@/server/session";

import { createProgramme, createStudent } from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  STAFF,
} from "../helpers/requests";

interface ListBody {
  items: { studentNumber: string; fullName: string }[];
  total: number;
  page: number;
  pageCount: number;
}

async function list(query = "", session: Session | null = STAFF) {
  const response = await listStudents(
    apiRequest("GET", `/api/students${query}`, { session }),
    routeContext({}),
  );
  return { status: response.status, body: await bodyOf<ListBody>(response) };
}

const names = (body: ListBody) => body.items.map((student) => student.fullName);

beforeEach(async () => {
  const computing = await createProgramme({ code: "BSC-CS" });
  const data = await createProgramme({ code: "MSC-DS" });
  await createStudent({
    studentNumber: "SMS-2025-0001",
    fullName: "Amelia Hart",
    email: "amelia.hart@student.example",
    programmeId: computing.id,
    academicYear: "2026/27",
  });
  await createStudent({
    studentNumber: "SMS-2026-0001",
    fullName: "Oliver Bennett",
    email: "oliver.bennett@student.example",
    programmeId: computing.id,
    academicYear: "2026/27",
  });
  await createStudent({
    studentNumber: "SMS-2026-0002",
    fullName: "Hannah Kowalski",
    email: "hannah.k@student.example",
    programmeId: data.id,
    academicYear: "2026/27",
    status: "WITHDRAWN",
  });
  await createStudent({
    studentNumber: "SMS-2024-0001",
    fullName: "Mohammed Al-Farsi",
    email: "m.alfarsi@student.example",
    programmeId: computing.id,
    academicYear: "2025/26",
    status: "COMPLETED",
  });
});

describe("GET /api/students", () => {
  it("lists every student by name, with the total", async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(names(body)).toEqual([
      "Amelia Hart",
      "Hannah Kowalski",
      "Mohammed Al-Farsi",
      "Oliver Bennett",
    ]);
    expect(body).toMatchObject({ total: 4, page: 1, pageCount: 1 });
  });

  it("finds students by part of their name, ignoring case", async () => {
    expect(names((await list("?q=HAR")).body)).toEqual(["Amelia Hart"]);
  });

  it("finds students by student ID or by email", async () => {
    expect(names((await list("?q=sms-2026-0002")).body)).toEqual([
      "Hannah Kowalski",
    ]);
    expect(names((await list("?q=alfarsi")).body)).toEqual([
      "Mohammed Al-Farsi",
    ]);
  });

  it("treats % and _ in a search as plain characters", async () => {
    expect((await list("?q=%25")).body.total).toBe(0);
    expect((await list("?q=_")).body.total).toBe(0);
  });

  it("filters by programme, status and academic year, and combines them", async () => {
    expect(names((await list("?programme=MSC-DS")).body)).toEqual([
      "Hannah Kowalski",
    ]);
    expect(names((await list("?status=COMPLETED")).body)).toEqual([
      "Mohammed Al-Farsi",
    ]);
    expect(names((await list("?year=2025/26")).body)).toEqual([
      "Mohammed Al-Farsi",
    ]);
    expect(
      names(
        (await list("?programme=BSC-CS&status=ENROLLED&year=2026/27&q=o")).body,
      ),
    ).toEqual(["Oliver Bennett"]);
  });

  it("ignores malformed filters instead of failing", async () => {
    const { status, body } = await list("?status=GRADUATED&year=2026&page=abc");
    expect(status).toBe(200);
    expect(body.total).toBe(4);
  });

  it("pages results 20 at a time, and stays on the last page if asked for more", async () => {
    for (let i = 0; i < 19; i += 1) await createStudent();

    const first = (await list()).body;
    expect(first).toMatchObject({ total: 23, page: 1, pageCount: 2 });
    expect(first.items).toHaveLength(20);

    const second = (await list("?page=2")).body;
    expect(second.items).toHaveLength(3);

    expect((await list("?page=9")).body.page).toBe(2);
  });

  it("is for staff only", async () => {
    expect((await list("", asStudent("SMS-2026-0001"))).status).toBe(403);
    expect((await list("", null)).status).toBe(401);
  });
});
