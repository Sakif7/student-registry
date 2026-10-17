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

/**
 * Claims one attempt to sign in (or to confirm a password) for the address.
 * The attempt is counted as a failure at once, before the password is
 * checked, and forgotten if it succeeds (see forgetFailedSignIns). Counting
 * first, one attempt at a time per address, means a burst of simultaneous
 * guesses can't all pass the check before any of them is counted.
 *
 * @returns When the address may next try, if it is locked; null once the
 *   attempt is claimed.
 */
export async function claimSignInAttempt(
  email: string,
  now: Date,
): Promise<Date | null> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sign-in:${email}`}))`;
    const windowStart = new Date(now.getTime() - WINDOW_MS);
    const failures = await tx.signInFailure.findMany({
      where: { email, createdAt: { gt: windowStart } },
      select: { createdAt: true },
    });
    const lockedUntil = signInLockedUntil(
      failures.map(({ createdAt }) => createdAt),
      now,
    );
    if (lockedUntil) return lockedUntil;
    // Failures too old to count, from any address, aren't needed any more.
    await tx.signInFailure.deleteMany({
      where: { createdAt: { lte: windowStart } },
    });
    await tx.signInFailure.create({ data: { email, createdAt: now } });
    return null;
  });
}

/** Forgets an address's failures, once its owner signs in or resets. */
export async function forgetFailedSignIns(email: string): Promise<void> {
  await db().signInFailure.deleteMany({ where: { email } });
}
