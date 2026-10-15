import { describe, expect, it } from "vitest";

import {
  chargeAmountSchema,
  MAX_AMOUNT_PENCE,
  parsePounds,
  paymentAmountSchema,
  poundsField,
  penceToPoundsInput,
} from "./money";

describe("parsePounds", () => {
  it.each([
    ["1250", 125_000],
    ["1250.5", 125_050],
    ["1250.50", 125_050],
    ["£1,250.50", 125_050],
    [" 9,535.00 ", 953_500],
    ["0.01", 1],
    ["0", 0],
    ["1,000,000", 100_000_000],
  ])("reads %j as %i pence", (input, pence) => {
    expect(parsePounds(input)).toBe(pence);
  });

  it("avoids floating-point rounding", () => {
    // 0.29 * 100 is 28.999999999999996 in floating point.
    expect(parsePounds("0.29")).toBe(29);
    expect(parsePounds("1.15")).toBe(115);
  });

  it.each(["", "-5", "12.345", "1,25.00", "12,50", "£", "abc", "1e3", "1 250"])(
    "rejects %j",
    (input) => {
      expect(parsePounds(input)).toBeNull();
    },
  );
});

describe("penceToPoundsInput", () => {
  it("writes pence as pounds with two decimal places", () => {
    expect(penceToPoundsInput(125_050)).toBe("1250.50");
    expect(penceToPoundsInput(5)).toBe("0.05");
    expect(penceToPoundsInput(0)).toBe("0.00");
    expect(penceToPoundsInput(-1_200)).toBe("-12.00");
  });
});

describe("amount schemas", () => {
  it("requires a payment of at least 1p", () => {
    expect(paymentAmountSchema.safeParse(1).success).toBe(true);
    expect(paymentAmountSchema.safeParse(0).error?.issues[0]?.message).toBe(
      "The amount must be more than £0.00",
    );
  });

  it("allows a zero charge, e.g. a full scholarship", () => {
    expect(chargeAmountSchema.safeParse(0).success).toBe(true);
    expect(chargeAmountSchema.safeParse(-1).success).toBe(false);
  });

  it("rejects fractions of a penny and implausible amounts", () => {
    expect(paymentAmountSchema.safeParse(10.5).error?.issues[0]?.message).toBe(
      "Amounts are in whole pence",
    );
    expect(paymentAmountSchema.safeParse(MAX_AMOUNT_PENCE).success).toBe(true);
    expect(paymentAmountSchema.safeParse(MAX_AMOUNT_PENCE + 1).success).toBe(
      false,
    );
  });
});

describe("poundsField", () => {
  const field = poundsField(paymentAmountSchema);

  it("turns typed pounds into pence", () => {
    expect(field.parse("£1,250.50")).toBe(125_050);
  });

  it("explains text that isn't an amount", () => {
    expect(field.safeParse("twelve").error?.issues[0]?.message).toBe(
      "Enter an amount in pounds, e.g. 1250.00",
    );
  });

  it("applies the amount rules after converting", () => {
    expect(field.safeParse("0").error?.issues[0]?.message).toBe(
      "The amount must be more than £0.00",
    );
  });
});
