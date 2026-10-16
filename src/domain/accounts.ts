// Sign-in accounts: the password rules, the limit on failed sign-ins, and
// the shape of the sign-in and password forms. Better Auth enforces the same
// password limits on the server.
import { z } from "zod";

/**
 * Passwords need length rather than character rules, as NIST guidance
 * recommends: a long passphrase beats a short password with symbols.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** A session lasts this many hours from sign-in, however active. */
export const SESSION_HOURS = 8;
/** Activation and password-reset links work for this many hours. */
export const LINK_HOURS = 72;

const emailField = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .pipe(z.email("Enter a valid email address"));

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password"),
});

/** Asking for a password-reset link. */
export const forgotPasswordSchema = z.object({ email: emailField });

/** A new password, typed twice. */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Use at least ${MIN_PASSWORD_LENGTH} characters`,
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `Use ${MAX_PASSWORD_LENGTH} characters or fewer`,
      ),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ["confirmation"],
    error: "The passwords don't match",
  });

/** Failed sign-ins one email address may make within the window below. */
export const MAX_FAILED_SIGN_INS = 5;
/** How long a failed sign-in counts against its email address. */
export const FAILED_SIGN_IN_MINUTES = 15;
/** Password-reset emails one account may receive in an hour. */
export const MAX_RESET_EMAILS_PER_HOUR = 3;

const MS_PER_MINUTE = 60_000;

/**
 * When an email address may next try to sign in, given its failed attempts,
 * or null if it may now. After {@link MAX_FAILED_SIGN_INS} failures within
 * {@link FAILED_SIGN_IN_MINUTES}, it waits until enough of them are that old.
 */
export function signInLockedUntil(
  failures: readonly Date[],
  now: Date,
): Date | null {
  const windowMs = FAILED_SIGN_IN_MINUTES * MS_PER_MINUTE;
  const recent = failures
    .map((failure) => failure.getTime())
    .filter((time) => now.getTime() - time < windowMs)
    .sort((a, b) => b - a);
  // The lock lifts when the failure that reached the limit leaves the window.
  const reachedLimit = recent[MAX_FAILED_SIGN_INS - 1];
  return reachedLimit === undefined ? null : new Date(reachedLimit + windowMs);
}

/** What someone whose address is locked is told. */
export function signInLockedMessage(until: Date, now: Date): string {
  const minutes = Math.max(
    1,
    Math.ceil((until.getTime() - now.getTime()) / MS_PER_MINUTE),
  );
  return `Too many failed attempts to sign in with this email address. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** Where a student's sign-in account stands. */
export type SignInState = "PENDING" | "ACTIVE" | "DISABLED";

export const SIGN_IN_STATE_LABELS: Record<SignInState, string> = {
  PENDING: "Waiting for activation",
  ACTIVE: "Active",
  DISABLED: "Turned off",
};

/**
 * An account is active once its owner has set a password from an emailed
 * link, and staff can turn sign-in off whatever its state. A student without
 * an account yet is waiting for activation.
 */
export function signInState(
  account: { emailVerified: boolean; disabledAt: Date | null } | null,
): SignInState {
  if (account?.disabledAt) return "DISABLED";
  return account?.emailVerified ? "ACTIVE" : "PENDING";
}

/** Turning a student's sign-in off or back on. */
export const signInAccessSchema = z.object({
  enabled: z.boolean({ error: "Say whether sign-in should be on" }),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
