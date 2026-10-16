import { describe, expect, it } from "vitest";

import { newPasswordSchema, signInSchema } from "./accounts";

const firstMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("signInSchema", () => {
  it("trims the email address", () => {
    expect(
      signInSchema.parse({ email: " jane@college.example ", password: "x" }),
    ).toEqual({ email: "jane@college.example", password: "x" });
  });

  it("asks for each field", () => {
    expect(
      firstMessage(signInSchema.safeParse({ email: "", password: "x" })),
    ).toBe("Enter your email address");
    expect(
      firstMessage(signInSchema.safeParse({ email: "jane", password: "x" })),
    ).toBe("Enter a valid email address");
    expect(
      firstMessage(
        signInSchema.safeParse({ email: "jane@college.example", password: "" }),
      ),
    ).toBe("Enter your password");
  });
});

describe("newPasswordSchema", () => {
  it("accepts a long password typed the same twice", () => {
    expect(
      newPasswordSchema.safeParse({
        password: "correct horse battery",
        confirmation: "correct horse battery",
      }).success,
    ).toBe(true);
  });

  it("needs 12 characters, and both entries to match", () => {
    expect(
      firstMessage(
        newPasswordSchema.safeParse({
          password: "short",
          confirmation: "short",
        }),
      ),
    ).toBe("Use at least 12 characters");
    const mismatch = newPasswordSchema.safeParse({
      password: "correct horse battery",
      confirmation: "correct horse staple",
    });
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmation"]);
    expect(firstMessage(mismatch)).toBe("The passwords don't match");
  });
});
