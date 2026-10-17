// Correcting fee charges (PATCH /api/fees/{id}) and reversing payments
// (POST /api/payments/{id}/reversal).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH as correctFee } from "@/app/api/fees/[feeId]/route";
import { POST as reversePayment } from "@/app/api/payments/[paymentId]/reversal/route";
import { GET as getAccount } from "@/app/api/students/[studentNumber]/account/route";
import { POST as recordPayment } from "@/app/api/students/[studentNumber]/payments/route";
import { toDbDate } from "@/domain/college-time";
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

const NOW = new Date("2026-10-15T11:00:00.000Z");
const UNKNOWN_ID = "0195f6b4-0000-7000-8000-000000000000";

interface AccountBody {
  account: {
    standing: string;
    summary: { chargedPence: number; paidPence: number; overduePence: number };
    charges: { amountPence: number; dueDate: string; note: string | null }[];
    payments: { reference: string; reversal: { reason: string } | null }[];
  };
}

let feeId: string;
let paymentId: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const programme = await createProgramme({ annualFeePence: 953_500 });
  const student = await createStudent({
    studentNumber: "SMS-2025-0001",
    programmeId: programme.id,
    academicYear: "2026/27",
  });
  feeId = (
    await db().feeCharge.create({
      data: {
        studentId: student.id,
        academicYear: "2026/27",
        description: "Tuition fee 2026/27",
        amountPence: 953_500,
        dueDate: toDbDate("2026-10-01"),
      },
    })
  ).id;
  paymentId = (
    await db().payment.create({
      data: {
        studentId: student.id,
        amountPence: 500_000,
        paidOn: toDbDate("2026-10-05"),
        reference: "BACS 1",
      },
    })
  ).id;
});

afterEach(() => {
  vi.useRealTimers();
});

async function correct(
  body: unknown,
  id = feeId,
  session: Viewer | null = STAFF,
) {
  return correctFee(
    await apiRequest("PATCH", `/api/fees/${id}`, { json: body, session }),
    routeContext({ feeId: id }),
  );
}

async function reverse(
  body: unknown,
  id = paymentId,
  session: Viewer | null = STAFF,
) {
  return reversePayment(
    await apiRequest("POST", `/api/payments/${id}/reversal`, {
      json: body,
      session,
    }),
    routeContext({ paymentId: id }),
  );
}

describe("PATCH /api/fees/[feeId]", () => {
  it("corrects the amount, with a note, and recalculates the account", async () => {
    const response = await correct({
      amountPence: 476_750,
      note: "Half scholarship",
    });

    expect(response.status).toBe(200);
    const { account } = await bodyOf<AccountBody>(response);
    expect(account.charges).toMatchObject([
      { amountPence: 476_750, note: "Half scholarship" },
    ]);
    expect(account.summary).toMatchObject({
      chargedPence: 476_750,
      overduePence: 0,
    });
    expect(account.standing).toBe("CREDIT");
  });

  it("moves the due date, e.g. for a payment plan, which clears the overdue flag", async () => {
    const { account } = await bodyOf<AccountBody>(
      await correct({ dueDate: "2026-11-30" }),
    );
    expect(account.charges[0]?.dueDate).toBe("2026-11-30");
    expect(account.summary.overduePence).toBe(0);
    expect(account.standing).toBe("DUE");
  });

  it("needs a note for a non-standard amount, and something to change", async () => {
    expect(await bodyOf(await correct({ amountPence: 1 }))).toMatchObject({
      status: 400,
      errors: {
        note: [
          "Explain why the amount differs from the standard fee of £9,535.00",
        ],
      },
    });
    expect(await bodyOf(await correct({ note: "typo" }))).toMatchObject({
      status: 400,
      detail: "Change the amount or the due date",
    });
  });

  it("removes the note with the amount back at the standard fee, but not before", async () => {
    await correct({ amountPence: 476_750, note: "Half scholarship" });
    // Still a non-standard amount, so the note stays needed.
    expect((await correct({ amountPence: 476_750, note: "" })).status).toBe(
      400,
    );

    const { account } = await bodyOf<AccountBody>(
      await correct({ amountPence: 953_500, note: "" }),
    );
    expect(account.charges[0]?.note).toBeNull();
  });

  it("records nothing when the charge is saved unchanged", async () => {
    const response = await correct({
      amountPence: 953_500,
      dueDate: "2026-10-01",
      note: "",
    });
    expect(response.status).toBe(200);
    expect(
      await db().auditEvent.count({ where: { action: "fee.corrected" } }),
    ).toBe(0);
  });

  it("404s for a malformed or unknown ID, and is for staff only", async () => {
    expect((await correct({ dueDate: "2026-11-30" }, "not-an-id")).status).toBe(
      404,
    );
    expect((await correct({ dueDate: "2026-11-30" }, UNKNOWN_ID)).status).toBe(
      404,
    );
    expect(
      (
        await correct(
          { dueDate: "2026-11-30" },
          feeId,
          asStudent("SMS-2025-0001"),
        )
      ).status,
    ).toBe(403);
  });
});

describe("POST /api/payments/[paymentId]/reversal", () => {
  it("keeps the payment on record but stops counting it", async () => {
    const response = await reverse({ reason: "Payment recalled by the bank" });

    expect(response.status).toBe(201);
    const { account } = await bodyOf<AccountBody>(response);
    expect(account.payments).toMatchObject([
      {
        reference: "BACS 1",
        reversal: { reason: "Payment recalled by the bank" },
      },
    ]);
    expect(account.summary).toMatchObject({
      paidPence: 0,
      overduePence: 953_500,
    });
  });

  it("shows staff the reversed payment, but leaves it out of the student's own account", async () => {
    await reverse({ reason: "Keyed against the wrong student" });
    const view = async (session: Viewer) =>
      bodyOf<AccountBody>(
        await getAccount(
          await apiRequest("GET", "/api/students/SMS-2025-0001/account", {
            session,
          }),
          routeContext({ studentNumber: "SMS-2025-0001" }),
        ),
      );

    expect((await view(STAFF)).account.payments).toMatchObject([
      {
        reference: "BACS 1",
        reversal: { reason: "Keyed against the wrong student" },
      },
    ]);
    const own = (await view(asStudent("SMS-2025-0001"))).account;
    expect(own.payments).toEqual([]);
    expect(own.summary.paidPence).toBe(0);
  });

  it("lets a reversed payment's reference be recorded again, as the transfer is real", async () => {
    const record = async () =>
      recordPayment(
        await apiRequest("POST", "/api/students/SMS-2025-0001/payments", {
          session: STAFF,
          json: {
            amountPence: 500_000,
            paidOn: "2026-10-05",
            reference: "BACS 1",
          },
        }),
        routeContext({ studentNumber: "SMS-2025-0001" }),
      );
    // While the payment counts, its reference can't be recorded twice.
    expect((await record()).status).toBe(409);

    await reverse({ reason: "Keyed with the wrong amount" });
    expect((await record()).status).toBe(201);
    expect(await db().payment.count({ where: { reference: "BACS 1" } })).toBe(
      2,
    );
  });

  it("refuses to reverse a payment twice", async () => {
    await reverse({ reason: "Keyed against the wrong student" });
    const response = await reverse({ reason: "Again" });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({
      detail:
        "This payment was already reversed: Keyed against the wrong student",
    });
  });

  it("lets only one of two simultaneous reversals through", async () => {
    // Sign in for both first, so the two reversals really run side by side.
    const requests = await Promise.all(
      ["First", "Second"].map((reason) =>
        apiRequest("POST", `/api/payments/${paymentId}/reversal`, {
          json: { reason },
          session: STAFF,
        }),
      ),
    );
    const responses = await Promise.all(
      requests.map((request) =>
        reversePayment(request, routeContext({ paymentId })),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await db().paymentReversal.count()).toBe(1);
  });

  it("needs a reason, 404s for a bad ID, and is for staff only", async () => {
    expect((await reverse({ reason: "" })).status).toBe(400);
    expect((await reverse({ reason: "x y z" }, "nope")).status).toBe(404);
    expect(
      (
        await reverse(
          { reason: "x y z" },
          paymentId,
          asStudent("SMS-2025-0001"),
        )
      ).status,
    ).toBe(403);
    expect(await db().paymentReversal.count()).toBe(0);
  });
});
