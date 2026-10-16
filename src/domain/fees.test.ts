import { describe, expect, it } from "vitest";

import {
  accountStanding,
  allocatePayments,
  correctFeeSchema,
  nextChargeDue,
  normalisePaymentReference,
  recordPaymentSchema,
  summariseAccount,
  summariseYearFees,
} from "./fees";

const TODAY = "2026-10-15";
const paid = (amountPence: number) => ({ amountPence, reversed: false });

describe("summariseAccount", () => {
  it("is empty with no charges or payments", () => {
    const summary = summariseAccount([], [], TODAY);
    expect(summary).toEqual({
      chargedPence: 0,
      paidPence: 0,
      balancePence: 0,
      overduePence: 0,
      overdueSince: null,
      daysOverdue: 0,
    });
    expect(accountStanding(summary)).toBe("NONE");
  });

  it("is not overdue on the due date itself, only from the day after", () => {
    const charge = { amountPence: 953_500, dueDate: TODAY };
    expect(summariseAccount([charge], [], TODAY).overduePence).toBe(0);
    expect(summariseAccount([charge], [], "2026-10-16")).toMatchObject({
      overduePence: 953_500,
      overdueSince: TODAY,
      daysOverdue: 1,
    });
  });

  it("reports the unpaid part of a past-due charge after part-payment", () => {
    const summary = summariseAccount(
      [{ amountPence: 953_500, dueDate: "2026-09-15" }],
      [paid(500_000)],
      TODAY,
    );
    expect(summary).toMatchObject({
      balancePence: 453_500,
      overduePence: 453_500,
      overdueSince: "2026-09-15",
      daysOverdue: 30,
    });
    expect(accountStanding(summary)).toBe("OVERDUE");
  });

  it("applies payments to the oldest charge first", () => {
    // £9,535 for last year is overdue; £9,535 for this year isn't due yet.
    // A £9,535 payment clears last year's charge, so nothing is overdue,
    // whichever order the charges arrive in.
    const charges = [
      { amountPence: 953_500, dueDate: "2026-11-14" },
      { amountPence: 953_500, dueDate: "2025-10-15" },
    ];
    const summary = summariseAccount(charges, [paid(953_500)], TODAY);
    expect(summary).toMatchObject({ balancePence: 953_500, overduePence: 0 });
    expect(accountStanding(summary)).toBe("DUE");
  });

  it("dates the debt from the oldest charge that is still unpaid", () => {
    const charges = [
      { amountPence: 100_000, dueDate: "2026-08-01" },
      { amountPence: 100_000, dueDate: "2026-09-01" },
    ];
    expect(summariseAccount(charges, [paid(150_000)], TODAY)).toMatchObject({
      overduePence: 50_000,
      overdueSince: "2026-09-01",
      daysOverdue: 44,
    });
  });

  it("ignores reversed payments", () => {
    const summary = summariseAccount(
      [{ amountPence: 953_500, dueDate: "2026-09-15" }],
      [{ amountPence: 953_500, reversed: true }],
      TODAY,
    );
    expect(summary).toMatchObject({ paidPence: 0, overduePence: 953_500 });
  });

  it("shows an overpayment as credit", () => {
    const summary = summariseAccount(
      [{ amountPence: 953_500, dueDate: "2026-09-15" }],
      [paid(953_500), paid(10_000)],
      TODAY,
    );
    expect(summary).toMatchObject({ balancePence: -10_000, overduePence: 0 });
    expect(accountStanding(summary)).toBe("CREDIT");
  });

  it("is paid in full when payments exactly cover the charges", () => {
    const summary = summariseAccount(
      [{ amountPence: 953_500, dueDate: "2026-09-15" }],
      [paid(953_500)],
      TODAY,
    );
    expect(accountStanding(summary)).toBe("PAID");
  });

  it("treats a zero charge (full scholarship) as paid", () => {
    const summary = summariseAccount(
      [{ amountPence: 0, dueDate: "2026-09-15" }],
      [],
      TODAY,
    );
    expect(summary.overduePence).toBe(0);
    expect(accountStanding(summary)).toBe("NONE");
  });
});

describe("normalisePaymentReference", () => {
  it("ignores case and spacing", () => {
    expect(normalisePaymentReference("  bacs   ref-0042 ")).toBe(
      "BACS REF-0042",
    );
  });
});

describe("recordPaymentSchema", () => {
  const schema = recordPaymentSchema(TODAY);

  it("accepts a payment made today and normalises the reference", () => {
    expect(
      schema.parse({ amountPence: 50_000, paidOn: TODAY, reference: "bacs 1" }),
    ).toEqual({ amountPence: 50_000, paidOn: TODAY, reference: "BACS 1" });
  });

  it("rejects a future payment date", () => {
    const result = schema.safeParse({
      amountPence: 50_000,
      paidOn: "2026-10-16",
      reference: "BACS 1",
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["paidOn"],
      message: "The payment date can't be in the future",
    });
  });

  it("requires a reference", () => {
    const result = schema.safeParse({
      amountPence: 50_000,
      paidOn: TODAY,
      reference: "  ",
    });
    expect(result.error?.issues[0]?.message).toBe(
      "Enter the bank or receipt reference",
    );
  });
});

describe("correctFeeSchema", () => {
  it("needs a new amount or due date", () => {
    expect(
      correctFeeSchema.safeParse({ note: "typo" }).error?.issues[0]?.message,
    ).toBe("Change the amount or the due date");
    expect(correctFeeSchema.safeParse({ dueDate: "2026-11-30" }).success).toBe(
      true,
    );
  });
});

describe("allocatePayments", () => {
  it("fills the oldest charge first and shows what is left on each", () => {
    const lines = allocatePayments(
      [
        { id: "this-year", amountPence: 100_000, dueDate: "2026-11-01" },
        { id: "last-year", amountPence: 100_000, dueDate: "2025-11-01" },
      ],
      150_000,
      TODAY,
    );
    expect(lines).toEqual([
      {
        id: "last-year",
        amountPence: 100_000,
        dueDate: "2025-11-01",
        paidPence: 100_000,
        outstandingPence: 0,
        overdue: false,
      },
      {
        id: "this-year",
        amountPence: 100_000,
        dueDate: "2026-11-01",
        paidPence: 50_000,
        outstandingPence: 50_000,
        overdue: false,
      },
    ]);
  });

  it("marks only past-due, unpaid charges as overdue", () => {
    const [charge] = allocatePayments(
      [{ amountPence: 100_000, dueDate: "2026-10-14" }],
      0,
      TODAY,
    );
    expect(charge?.overdue).toBe(true);
  });
});

describe("summariseYearFees", () => {
  const YEAR = "2026/27";

  it("splits a year's charges into paid, overdue and not yet due", () => {
    const fees = summariseYearFees(
      [
        {
          // Part-paid and past its due date.
          charges: [
            { academicYear: YEAR, amountPence: 953_500, dueDate: "2026-10-01" },
          ],
          payments: [paid(500_000)],
        },
        {
          charges: [
            { academicYear: YEAR, amountPence: 953_500, dueDate: "2026-11-14" },
          ],
          payments: [],
        },
        {
          // Due today, so not overdue yet.
          charges: [
            { academicYear: YEAR, amountPence: 100_000, dueDate: TODAY },
          ],
          payments: [],
        },
      ],
      YEAR,
      TODAY,
    );

    expect(fees).toEqual({
      chargedPence: 2_007_000,
      paidPence: 500_000,
      overduePence: 453_500,
      notYetDuePence: 1_053_500,
    });
  });

  it("counts payments towards older years first, and leaves other years out", () => {
    const fees = summariseYearFees(
      [
        {
          charges: [
            {
              academicYear: "2025/26",
              amountPence: 953_500,
              dueDate: "2025-10-01",
            },
            { academicYear: YEAR, amountPence: 953_500, dueDate: "2026-11-14" },
          ],
          // Last year's £9,535 is cleared first, leaving £465 for this year.
          // The reversed payment counts for nothing.
          payments: [paid(1_000_000), { amountPence: 953_500, reversed: true }],
        },
      ],
      YEAR,
      TODAY,
    );

    expect(fees).toEqual({
      chargedPence: 953_500,
      paidPence: 46_500,
      overduePence: 0,
      notYetDuePence: 907_000,
    });
  });

  it("counts an overpayment only up to the charge", () => {
    const fees = summariseYearFees(
      [
        {
          charges: [
            { academicYear: YEAR, amountPence: 100_000, dueDate: "2026-10-01" },
          ],
          payments: [paid(150_000)],
        },
      ],
      YEAR,
      TODAY,
    );

    expect(fees).toEqual({
      chargedPence: 100_000,
      paidPence: 100_000,
      overduePence: 0,
      notYetDuePence: 0,
    });
  });
});

describe("nextChargeDue", () => {
  it("is the earliest charge not yet due that still has something to pay", () => {
    const charges = allocatePayments(
      [
        { id: "overdue", amountPence: 100_000, dueDate: "2026-10-01" },
        { id: "later", amountPence: 100_000, dueDate: "2027-01-15" },
        { id: "sooner", amountPence: 100_000, dueDate: "2026-11-14" },
      ],
      0,
      TODAY,
    );

    expect(nextChargeDue(charges)).toMatchObject({
      id: "sooner",
      outstandingPence: 100_000,
    });
  });

  it("skips charges already paid, and is null when nothing is left to pay", () => {
    const charges = [
      { id: "paid", amountPence: 100_000, dueDate: "2026-11-14" },
      { id: "due", amountPence: 100_000, dueDate: "2027-01-15" },
    ];

    expect(
      nextChargeDue(allocatePayments(charges, 150_000, TODAY)),
    ).toMatchObject({ id: "due", outstandingPence: 50_000 });
    expect(nextChargeDue(allocatePayments(charges, 200_000, TODAY))).toBeNull();
  });
});
