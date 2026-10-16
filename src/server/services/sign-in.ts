// Students' sign-in accounts, as Registry staff manage them: where each
// account stands, emailing an activation or password-reset link, and turning
// sign-in off and back on. Every student gets an account at enrolment; staff
// accounts come from the seed and have no such controls.
import "server-only";

import {
  LINK_HOURS,
  type SignInState,
  signInAccessSchema,
  signInState,
} from "@/domain/accounts";
import type { Prisma } from "@/generated/prisma/client";

import { auditEvent } from "../audit";
import { createPasswordLink } from "../auth";
import { db } from "../db";
import { activationEmail, passwordResetEmail } from "../emails";
import { AppError, parseInput, violatedUniqueConstraint } from "../errors";
import { sendEmail } from "../mail";
import { passwordLinksOf } from "../password-links";
import { requireStaff, type Session } from "../session";

/** A student's sign-in account, as staff see it. */
export interface StudentSignIn {
  /** The address the student signs in with: their email in the record. */
  email: string;
  state: SignInState;
  /** When the student first set a password, if they have. */
  activatedAt: Date | null;
  /** When staff turned sign-in off, while it is off. */
  disabledAt: Date | null;
  /** The newest emailed link, while it can still be used. */
  link: { sentAt: Date; expiresAt: Date } | null;
  /** Devices the student is signed in on now. */
  devices: number;
}

/** An emailed link: what kind, where to, and whether the email went. */
export interface SentLink {
  kind: "activation" | "reset";
  to: string;
  sent: boolean;
}

const accountSelect = {
  id: true,
  email: true,
  emailVerified: true,
  disabledAt: true,
} satisfies Prisma.UserSelect;

/**
 * Where a student's sign-in account stands (staff only).
 *
 * @throws AppError: NOT_FOUND for an unknown student.
 */
export async function getStudentSignIn(
  session: Session | null,
  studentNumber: string,
): Promise<StudentSignIn> {
  requireStaff(session);
  const now = new Date();
  const student = await findStudent(studentNumber, {
    select: {
      ...accountSelect,
      accounts: {
        where: { providerId: "credential" },
        select: { createdAt: true },
      },
      _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
    },
  });
  const account = student.user;
  if (!account) {
    return {
      email: student.email,
      state: "PENDING",
      activatedAt: null,
      disabledAt: null,
      link: null,
      devices: 0,
    };
  }
  const link = await db().verification.findFirst({
    where: { ...passwordLinksOf(account.id), expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, expiresAt: true },
  });
  return {
    email: account.email,
    state: signInState(account),
    activatedAt: account.accounts[0]?.createdAt ?? null,
    disabledAt: account.disabledAt,
    link: link && { sentAt: link.createdAt, expiresAt: link.expiresAt },
    devices: account._count.sessions,
  };
}

/**
 * Emails a student a link to set their password (staff only): an activation
 * link until they have activated their account, a password-reset link after.
 * A new link replaces any the student was sent before.
 *
 * @returns Whether the email went: a mail server failure isn't thrown, so
 *   that an enrolment can still succeed without it.
 * @throws AppError: NOT_FOUND; CONFLICT while sign-in is turned off, or if
 *   another account already uses the student's email address.
 */
export async function sendSignInLink(
  session: Session | null,
  studentNumber: string,
): Promise<SentLink> {
  const staff = requireStaff(session);
  const student = await findStudent(studentNumber, { select: accountSelect });
  if (student.user?.disabledAt) {
    throw new AppError(
      "CONFLICT",
      "Sign-in is turned off for this student. Turn it back on first.",
    );
  }
  const account = student.user ?? (await createAccount(student));
  const kind = account.emailVerified ? "reset" : "activation";

  await db().verification.deleteMany({ where: passwordLinksOf(account.id) });
  const url = await createPasswordLink(
    account.email,
    kind === "activation" ? "/activate" : "/reset-password",
  );
  const message = {
    to: account.email,
    name: student.fullName,
    url,
    validHours: LINK_HOURS,
  };
  try {
    await sendEmail(
      kind === "activation"
        ? activationEmail(message)
        : passwordResetEmail(message),
    );
  } catch (error) {
    console.error(`Couldn't email ${kind} link for ${studentNumber}:`, error);
    // Nobody received it, so it shouldn't count as sent.
    await db().verification.deleteMany({ where: passwordLinksOf(account.id) });
    return { kind, to: account.email, sent: false };
  }
  await db().auditEvent.create({
    data: auditEvent(staff, {
      action: "sign_in.link_sent",
      studentId: student.id,
      details: { kind },
    }),
  });
  return { kind, to: account.email, sent: true };
}

/**
 * Turns a student's sign-in off or back on (staff only). Turning it off
 * signs the student out on every device and cancels any emailed link.
 *
 * @throws AppError: NOT_FOUND; VALIDATION without `enabled`.
 */
export async function setSignInEnabled(
  session: Session | null,
  studentNumber: string,
  input: unknown,
): Promise<StudentSignIn> {
  const staff = requireStaff(session);
  const { enabled } = parseInput(signInAccessSchema, input);
  const student = await findStudent(studentNumber, { select: accountSelect });
  const account = student.user ?? (await createAccount(student));
  const wasDisabled = account.disabledAt !== null;

  if (enabled) {
    if (wasDisabled) {
      await db().$transaction([
        db().user.update({
          where: { id: account.id },
          data: { disabledAt: null },
        }),
        db().auditEvent.create({
          data: auditEvent(staff, {
            action: "sign_in.turned_on",
            studentId: student.id,
            details: {},
          }),
        }),
      ]);
    }
  } else {
    await db().$transaction([
      db().user.update({
        where: { id: account.id },
        // Turning it off again keeps the original date.
        data: { disabledAt: account.disabledAt ?? new Date() },
      }),
      db().session.deleteMany({ where: { userId: account.id } }),
      db().verification.deleteMany({ where: passwordLinksOf(account.id) }),
      ...(wasDisabled
        ? []
        : [
            db().auditEvent.create({
              data: auditEvent(staff, {
                action: "sign_in.turned_off",
                studentId: student.id,
                details: {},
              }),
            }),
          ]),
    ]);
  }
  return getStudentSignIn(session, studentNumber);
}

/** The student with their account, as `user` selects it. */
async function findStudent<Select extends Prisma.UserSelect>(
  studentNumber: string,
  user: { select: Select },
) {
  const number = studentNumber.toUpperCase();
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    select: {
      id: true,
      studentNumber: true,
      fullName: true,
      email: true,
      user,
    },
  });
  if (!student) {
    throw new AppError("NOT_FOUND", `There is no student with ID ${number}.`);
  }
  return student;
}

/**
 * Creates the account of a student who has none: one enrolled before sign-in
 * existed whose address was already taken, until staff changed it.
 */
async function createAccount(student: {
  studentNumber: string;
  fullName: string;
  email: string;
}) {
  try {
    return await db().user.create({
      data: {
        name: student.fullName,
        email: student.email,
        role: "student",
        studentNumber: student.studentNumber,
      },
      select: accountSelect,
    });
  } catch (error) {
    if (violatedUniqueConstraint(error) === "users_email_key") {
      throw new AppError(
        "CONFLICT",
        "Another account already uses this student's email address. Change the student's email first.",
      );
    }
    throw error;
  }
}
