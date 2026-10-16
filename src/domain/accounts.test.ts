import { describe, expect, it } from "vitest";

import {
  newPasswordSchema,
  signInLockedMessage,
  signInLockedUntil,
  signInSchema,
} from "./accounts";

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

describe("signInLockedUntil", () => {
  const now = new Date("2026-10-16T09:00:00.000Z");
  const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000);

  it("allows four recent failures", () => {
    expect(signInLockedUntil([1, 2, 3, 4].map(minutesAgo), now)).toBeNull();
  });

  it("locks the address at the fifth failure within 15 minutes", () => {
    const failures = [1, 2, 3, 4, 10].map(minutesAgo);

    // The oldest of the five leaves the window 5 minutes from now.
    expect(signInLockedUntil(failures, now)).toEqual(minutesAgo(-5));
  });

  it("ignores failures 15 minutes old or more", () => {
    expect(
      signInLockedUntil([1, 2, 3, 4, 15, 20].map(minutesAgo), now),
    ).toBeNull();
  });

  it("lifts the lock once fewer than five failures are left in the window", () => {
    const failures = [14, 1, 12, 3, 2, 13].map(minutesAgo);

    // In 2 minutes only the failures 1, 2, 3 and 12 minutes ago still count.
    expect(signInLockedUntil(failures, now)).toEqual(minutesAgo(-2));
  });
});

describe("signInLockedMessage", () => {
  const now = new Date("2026-10-16T09:00:00.000Z");

  it("says how many whole minutes are left", () => {
    expect(signInLockedMessage(new Date("2026-10-16T09:14:01.000Z"), now)).toBe(
      "Too many failed attempts to sign in with this email address. Try again in 15 minutes.",
    );
  });

  it("never says less than one minute", () => {
    expect(signInLockedMessage(new Date("2026-10-16T09:00:20.000Z"), now)).toBe(
      "Too many failed attempts to sign in with this email address. Try again in 1 minute.",
    );
  });
});
