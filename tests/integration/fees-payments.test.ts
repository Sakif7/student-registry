// Fees and payments: the account (GET /api/students/{id}/account), charging
// fees (POST .../fees), recording payments (POST .../payments), and the fee
// charged automatically at enrolment.
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getAccount } from "@/app/api/students/[studentNumber]/account/route";
import { POST as assignFee } from "@/app/api/students/[studentNumber]/fees/route";
import { POST as recordPayment } from "@/app/api/students/[studentNumber]/payments/route";
import { POST as changeStatus } from "@/app/api/students/[studentNumber]/status/route";
import { POST as enrolStudent } from "@/app/api/students/route";
import { db } from "@/server/db";

import { createProgramme, createStudent } from "../helpers/factories";
import {
  apiRequest,
  asStudent,
  bodyOf,
  routeContext,
  STAFF,
  type Viewer,
} from "../helpers/requests";

// Not a 2026 number: the enrolment tests below allocate those from the counter.
const NUMBER = "SMS-2025-0001";
// A fixed "now": 15 October 2026, midday in London.
const NOW = new Date("2026-10-15T11:00:00.000Z");

interface AccountBody {
  account: {
    standing: string;
    currentYearUncharged: boolean;
    summary: {
      chargedPence: number;
      paidPence: number;
      balancePence: number;
      overduePence: number;
      daysOverdue: number;
    };
    charges: {
      academicYear: string;
      amountPence: number;
      dueDate: string;
      note: string | null;
      outstandingPence: number;
      overdue: boolean;
    }[];
    payments: { reference: string; amountPence: number }[];
  };
}

type StudentRoute = (
  request: NextRequest,
  context: { params: Promise<{ studentNumber: string }> },
) => Promise<Response>;

async function post(
  handler: StudentRoute,
  path: "fees" | "payments",
  body: unknown,
  session: Viewer | null = STAFF,
  number = NUMBER,
) {
  return handler(
    await apiRequest("POST", `/api/students/${number}/${path}`, {
      json: body,
      session,
    }),
    routeContext({ studentNumber: number }),
  );
}

async function account(session: Viewer | null = STAFF, number = NUMBER) {
  const response = await getAccount(
    await apiRequest("GET", `/api/students/${number}/account`, { session }),
    routeContext({ studentNumber: number }),
  );
  return { status: response.status, body: await bodyOf<AccountBody>(response) };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const programme = await createProgramme({
    code: "BSC-CS",
    title: "BSc (Hons) Computer Science",
    annualFeePence: 953_500,
  });
  await createStudent({
    studentNumber: NUMBER,
    academicYear: "2026/27",
    programmeId: programme.id,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fees charged at enrolment", () => {
  async function enrol(status: string, email: string) {
    const response = await enrolStudent(
      await apiRequest("POST", "/api/students", {
        session: STAFF,
        json: {
          fullName: "Grace Thompson",
          email,
          dateOfBirth: "2005-03-12",
          programmeCode: "BSC-CS",
          academicYear: "2026/27",
          status,
        },
      }),
      routeContext({}),
    );
    return (await bodyOf<{ student: { studentNumber: string } }>(response))
      .student.studentNumber;
  }

  it("charges an enrolled student the standard fee, due in 30 days", async () => {
    const number = await enrol("ENROLLED", "grace@student.example");
    const { body } = await account(STAFF, number);
    expect(body.account.charges).toMatchObject([
      {
        academicYear: "2026/27",
        amountPence: 953_500,
        dueDate: "2026-11-14",
        overdue: false,
      },
    ]);
    expect(body.account.standing).toBe("DUE");
  });

  it("charges nothing for a deferred entry, and asks for the fee once the student returns", async () => {
    const number = await enrol("DEFERRED", "grace@student.example");
    const deferred = (await account(STAFF, number)).body.account;
    expect(deferred.charges).toEqual([]);
    // Not attending, so there is nothing to charge yet.
    expect(deferred.currentYearUncharged).toBe(false);

    const returned = await changeStatus(
      await apiRequest("POST", `/api/students/${number}/status`, {
        session: STAFF,
        json: { status: "ENROLLED" },
      }),
      routeContext({ studentNumber: number }),
    );
    expect(returned.status).toBe(200);
    expect(
      (await account(STAFF, number)).body.account.currentYearUncharged,
    ).toBe(true);
  });
});

describe("POST /api/students/[studentNumber]/fees", () => {
  it("charges the standard fee by default and prompts no more", async () => {
    expect((await account()).body.account.currentYearUncharged).toBe(true);

    const response = await post(assignFee, "fees", { academicYear: "2026/27" });
    expect(response.status).toBe(201);
    const { account: updated } = await bodyOf<AccountBody>(response);
    expect(updated.charges).toMatchObject([
      { amountPence: 953_500, dueDate: "2026-11-14" },
    ]);
    expect(updated.currentYearUncharged).toBe(false);
  });

  it("needs a note when the amount differs from the standard fee", async () => {
    const withoutNote = await post(assignFee, "fees", {
      academicYear: "2026/27",
      amountPence: 476_750,
    });
    expect(withoutNote.status).toBe(400);
    expect(await bodyOf(withoutNote)).toMatchObject({
      errors: {
        note: [
          "Explain why the amount differs from the standard fee of £9,535.00",
        ],
      },
    });

    const withNote = await post(assignFee, "fees", {
      academicYear: "2026/27",
      amountPence: 0,
      note: "Full scholarship",
    });
    expect(withNote.status).toBe(201);
    expect((await bodyOf<AccountBody>(withNote)).account.standing).toBe("NONE");
  });

  it("refuses a second fee for the same academic year", async () => {
    await post(assignFee, "fees", { academicYear: "2026/27" });
    const response = await post(assignFee, "fees", { academicYear: "2026/27" });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      errors: {
        academicYear: [
          "A fee for 2026/27 is already charged. Correct that charge instead.",
        ],
      },
    });
  });
});

describe("POST /api/students/[studentNumber]/payments", () => {
  beforeEach(async () => {
    await post(assignFee, "fees", {
      academicYear: "2026/27",
      dueDate: "2026-10-01",
    });
  });

  it("updates the balance and overdue amount as soon as a payment is recorded", async () => {
    const before = (await account()).body.account.summary;
    expect(before).toMatchObject({
      balancePence: 953_500,
      overduePence: 953_500,
      daysOverdue: 14,
    });

    const response = await post(recordPayment, "payments", {
      amountPence: 500_000,
      paidOn: "2026-10-15",
      reference: "bacs  0042",
    });
    expect(response.status).toBe(201);
    const { account: after } = await bodyOf<AccountBody>(response);
    expect(after.summary).toMatchObject({
      paidPence: 500_000,
      balancePence: 453_500,
      overduePence: 453_500,
    });
    expect(after.payments).toMatchObject([
      { reference: "BACS 0042", amountPence: 500_000 },
    ]);
  });

  it("shows an overpayment as credit", async () => {
    await post(recordPayment, "payments", {
      amountPence: 963_500,
      paidOn: "2026-10-15",
      reference: "BACS 1",
    });
    const { summary, standing } = (await account()).body.account;
    expect(summary.balancePence).toBe(-10_000);
    expect(standing).toBe("CREDIT");
  });

  it("refuses the same reference twice, ignoring case and spacing", async () => {
    await post(recordPayment, "payments", {
      amountPence: 100,
      paidOn: "2026-10-15",
      reference: "BACS 0042",
    });
    const response = await post(recordPayment, "payments", {
      amountPence: 100,
      paidOn: "2026-10-15",
      reference: " bacs   0042 ",
    });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      errors: {
        reference: ["A payment with reference BACS 0042 is already recorded"],
      },
    });
  });

  it("rejects a future date and an amount of zero", async () => {
    const response = await post(recordPayment, "payments", {
      amountPence: 0,
      paidOn: "2026-10-16",
      reference: "BACS 1",
    });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      errors: {
        amountPence: ["The amount must be more than £0.00"],
        paidOn: ["The payment date can't be in the future"],
      },
    });
  });

  it("is for staff only, and 404s for an unknown student", async () => {
    const body = { amountPence: 100, paidOn: "2026-10-15", reference: "X" };
    expect(
      (await post(recordPayment, "payments", body, asStudent(NUMBER))).status,
    ).toBe(403);
    expect(
      (await post(recordPayment, "payments", body, STAFF, "SMS-2026-0999"))
        .status,
    ).toBe(404);
    expect(await db().payment.count()).toBe(0);
  });
});

describe("GET /api/students/[studentNumber]/account", () => {
  it("shows an account to staff and to the student, not to another student", async () => {
    expect((await account(STAFF)).status).toBe(200);
    expect((await account(asStudent(NUMBER))).status).toBe(200);
    // Another real student, signed in, still can't see it.
    await createStudent({ studentNumber: "SMS-2024-0099" });
    expect((await account(asStudent("SMS-2024-0099"))).status).toBe(403);
  });

  it("treats a charge as overdue only from the day after it is due", async () => {
    await post(assignFee, "fees", {
      academicYear: "2026/27",
      dueDate: "2026-10-15",
    });
    expect((await account()).body.account.summary.overduePence).toBe(0);

    vi.setSystemTime(new Date("2026-10-16T08:00:00.000Z"));
    expect((await account()).body.account.summary).toMatchObject({
      overduePence: 953_500,
      daysOverdue: 1,
    });
  });
});
