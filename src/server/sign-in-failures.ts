// Failed sign-ins per email address, for the lock in src/domain/accounts.ts.
// They are recorded whether or not an account has the address, so a locked
// address gives nothing away.
import "server-only";

import { FAILED_SIGN_IN_MINUTES, signInLockedUntil } from "@/domain/accounts";

import { db } from "./db";

const WINDOW_MS = FAILED_SIGN_IN_MINUTES * 60_000;

/** The address as Better Auth compares it, or null if it isn't text. */
export function normaliseEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().toLowerCase()
    : null;
}

/** When the address may next try to sign in, or null if it may now. */
export async function signInLockedFor(
  email: string,
  now: Date,
): Promise<Date | null> {
  const failures = await db().signInFailure.findMany({
    where: { email, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } },
    select: { createdAt: true },
  });
  return signInLockedUntil(
    failures.map(({ createdAt }) => createdAt),
    now,
  );
}

/** Records a failed sign-in, and deletes failures too old to count. */
export async function recordFailedSignIn(email: string): Promise<void> {
  const now = new Date();
  await db().$transaction([
    db().signInFailure.deleteMany({
      where: { createdAt: { lte: new Date(now.getTime() - WINDOW_MS) } },
    }),
    db().signInFailure.create({ data: { email, createdAt: now } }),
  ]);
}

/** Forgets an address's failures, once its owner signs in or resets. */
export async function forgetFailedSignIns(email: string): Promise<void> {
  await db().signInFailure.deleteMany({ where: { email } });
}
