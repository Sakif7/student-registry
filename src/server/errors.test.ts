import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError, parseInput, violatedUniqueConstraint } from "./errors";

const schema = z
  .object({ name: z.string().min(2, "Too short"), age: z.number() })
  .refine((value) => value.name !== "root", { error: "Reserved name" });

describe("parseInput", () => {
  it("returns parsed input", () => {
    expect(parseInput(schema, { name: "Amelia", age: 22 })).toEqual({
      name: "Amelia",
      age: 22,
    });
  });

  it("throws a VALIDATION error with messages per field", () => {
    try {
      parseInput(schema, { name: "A" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        kind: "VALIDATION",
        status: 400,
        message: "Some fields need correcting.",
        fieldErrors: { name: ["Too short"], age: [expect.any(String)] },
      });
    }
  });

  it("uses a form-level message as the error message", () => {
    expect(() => parseInput(schema, { name: "root", age: 1 })).toThrow(
      "Reserved name",
    );
  });
});

describe("violatedUniqueConstraint", () => {
  it("is null for errors that are not unique violations", () => {
    expect(violatedUniqueConstraint(new Error("boom"))).toBeNull();
    expect(violatedUniqueConstraint("text")).toBeNull();
  });
});
