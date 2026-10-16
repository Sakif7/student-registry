import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  describeDevice,
  newPasswordSchema,
  signInAccessSchema,
  signInLockedMessage,
  signInLockedUntil,
  signInSchema,
  signInState,
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

describe("signInState", () => {
  it("is waiting for activation until a password is set", () => {
    expect(signInState(null)).toBe("PENDING");
    expect(signInState({ emailVerified: false, disabledAt: null })).toBe(
      "PENDING",
    );
  });

  it("is active once the owner has set a password from an emailed link", () => {
    expect(signInState({ emailVerified: true, disabledAt: null })).toBe(
      "ACTIVE",
    );
  });

  it("is turned off whenever staff have turned it off", () => {
    const disabledAt = new Date("2026-10-08T09:00:00.000Z");
    expect(signInState({ emailVerified: true, disabledAt })).toBe("DISABLED");
    expect(signInState({ emailVerified: false, disabledAt })).toBe("DISABLED");
  });
});

describe("signInAccessSchema", () => {
  it("takes true or false, and nothing else", () => {
    expect(signInAccessSchema.parse({ enabled: false })).toEqual({
      enabled: false,
    });
    expect(
      signInAccessSchema.safeParse({ enabled: "no" }).error?.issues[0]?.message,
    ).toBe("Say whether sign-in should be on");
  });
});

describe("changePasswordSchema", () => {
  it("asks for the current password, and the new one twice", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      password: "a-brand-new-passphrase",
      confirmation: "something-else-entirely",
    });

    expect(
      result.error?.issues.map(({ path, message }) => [path, message]),
    ).toEqual([
      [["currentPassword"], "Enter your current password"],
      [["confirmation"], "The passwords don't match"],
    ]);
  });
});

describe("describeDevice", () => {
  it.each([
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Chrome on Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
      "Chrome on iPhone",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0",
      "Firefox on macOS",
    ],
    [
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    ["curl/8.9.1", "curl"],
    ["Test browser", "Unknown device"],
  ])("describes %s", (userAgent, device) => {
    expect(describeDevice(userAgent)).toBe(device);
  });

  it("knows nothing without a user agent", () => {
    expect(describeDevice(null)).toBe("Unknown device");
  });
});
