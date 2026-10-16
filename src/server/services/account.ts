// The signed-in user's own account, staff or student: changing their
// password, and the devices they are signed in on.
import "server-only";

import { hashPassword, verifyPassword } from "better-auth/crypto";

import {
  changePasswordSchema,
  describeDevice,
  signInLockedMessage,
} from "@/domain/accounts";

import { db } from "../db";
import { AppError, parseInput } from "../errors";
import { isId } from "../ids";
import { requireSession, type Session } from "../session";
import {
  forgetFailedSignIns,
  recordFailedSignIn,
  signInLockedFor,
} from "../sign-in-failures";

/** The user's own details, as the Registry holds them. */
export interface AccountDetails {
  name: string;
  email: string;
  /** The student's ID, for a student; null for staff. */
  studentNumber: string | null;
}

/** A device the user is signed in on: one of their sessions. */
export interface SignedInDevice {
  id: string;
  /** The browser and system, e.g. "Chrome on Windows". */
  device: string;
  ipAddress: string | null;
  signedInAt: Date;
  expiresAt: Date;
  /** The device this request comes from. */
  current: boolean;
}

/** The signed-in user's name, email address and student ID. */
export async function getAccountDetails(
  session: Session | null,
): Promise<AccountDetails> {
  const { userId } = requireSession(session);
  return db().user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, studentNumber: true },
  });
}

/**
 * Changes the user's password, and signs them out on every other device.
 * Getting the current password wrong counts as a failed sign-in for the
 * account's address, so a stolen session can't be used to guess it.
 *
 * @returns How many other devices were signed out.
 * @throws AppError: VALIDATION for a wrong current password or a new one
 *   that breaks the rules; TOO_MANY_REQUESTS while the address is locked.
 */
export async function changePassword(
  session: Session | null,
  input: unknown,
): Promise<{ signedOutDevices: number }> {
  const { userId, sessionId } = requireSession(session);
  const { currentPassword, password } = parseInput(changePasswordSchema, input);
  const user = await db().user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      accounts: {
        where: { providerId: "credential" },
        select: { id: true, password: true },
      },
    },
  });

  const now = new Date();
  const lockedUntil = await signInLockedFor(user.email, now);
  if (lockedUntil) {
    throw new AppError(
      "TOO_MANY_REQUESTS",
      signInLockedMessage(lockedUntil, now),
    );
  }
  const account = user.accounts[0];
  const correct =
    account?.password != null &&
    (await verifyPassword({
      hash: account.password,
      password: currentPassword,
    }));
  if (!account || !correct) {
    await recordFailedSignIn(user.email);
    throw new AppError("VALIDATION", "Some fields need correcting.", {
      currentPassword: ["That isn't your current password"],
    });
  }

  const hash = await hashPassword(password);
  const [, signedOut] = await db().$transaction([
    db().account.update({
      where: { id: account.id },
      data: { password: hash },
    }),
    db().session.deleteMany({ where: { userId, NOT: { id: sessionId } } }),
  ]);
  await forgetFailedSignIns(user.email);
  return { signedOutDevices: signedOut.count };
}

/** The devices the user is signed in on now, this one first. */
export async function listDevices(
  session: Session | null,
): Promise<SignedInDevice[]> {
  const { userId, sessionId } = requireSession(session);
  const sessions = await db().session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  return sessions
    .map((row) => ({
      id: row.id,
      device: describeDevice(row.userAgent),
      ipAddress: row.ipAddress,
      signedInAt: row.createdAt,
      expiresAt: row.expiresAt,
      current: row.id === sessionId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/**
 * Signs the user out on one of their other devices.
 *
 * @throws AppError: NOT_FOUND for a session that isn't theirs or has ended;
 *   CONFLICT for this device, which signs out with "Sign out".
 */
export async function signOutDevice(
  session: Session | null,
  deviceId: string,
): Promise<void> {
  const { userId, sessionId } = requireSession(session);
  if (deviceId === sessionId) {
    throw new AppError("CONFLICT", "To sign out of this device, use Sign out.");
  }
  const { count } = isId(deviceId)
    ? await db().session.deleteMany({ where: { id: deviceId, userId } })
    : { count: 0 };
  if (count === 0) {
    throw new AppError("NOT_FOUND", "You aren't signed in on that device.");
  }
}

/** Signs the user out on every device but this one. */
export async function signOutOtherDevices(
  session: Session | null,
): Promise<{ signedOutDevices: number }> {
  const { userId, sessionId } = requireSession(session);
  const { count } = await db().session.deleteMany({
    where: { userId, NOT: { id: sessionId } },
  });
  return { signedOutDevices: count };
}
