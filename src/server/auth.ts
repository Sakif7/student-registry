// Sign-in with Better Auth: email and password, sessions stored in
// PostgreSQL, password-reset links by email, and rate limiting. Nobody signs
// up: every account is made for its owner (see prisma/seed.ts).
//
// The instance is created on first use, like the database client, so
// importing this module (as `next build` does) needs no configuration.
import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/domain/accounts";

import { db } from "./db";
import { activationEmail, passwordResetEmail } from "./emails";
import { env } from "./env";
import { sendEmailLater } from "./mail";

const HOUR_SECONDS = 60 * 60;

/** A session lasts this many hours from sign-in, however active. */
export const SESSION_HOURS = 8;
/** Activation and password-reset links work for this many hours. */
export const LINK_HOURS = 72;

function createAuth() {
  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = env();
  return betterAuth({
    appName: "Student Registry",
    baseURL: BETTER_AUTH_URL,
    secret: BETTER_AUTH_SECRET,
    database: prismaAdapter(db(), {
      provider: "postgresql",
      transaction: true,
    }),
    // Endpoints this app has no use for, switched off so nobody can call
    // them: names and email addresses come from the Registry's records, and
    // there are no social sign-ins or email-verification links.
    disabledPaths: [
      "/sign-up/email",
      "/update-user",
      "/update-session",
      "/change-email",
      "/delete-user",
      "/delete-user/callback",
      "/verify-password",
      "/send-verification-email",
      "/verify-email",
      "/sign-in/social",
      "/link-social",
      "/unlink-account",
      "/list-accounts",
      "/account-info",
      "/refresh-token",
      "/get-access-token",
    ],
    advanced: {
      // Prisma assigns the same UUIDv7 primary keys as every other table.
      database: { generateId: false },
      cookiePrefix: "registry",
    },
    user: {
      additionalFields: {
        role: { type: "string", required: true, input: false },
        studentNumber: { type: "string", required: false, input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: SESSION_HOURS * HOUR_SECONDS,
      // Not extended by activity. Pages read the session on the server, where
      // a renewed cookie can't be sent back, so the browser would drop the
      // cookie when it first expired anyway.
      disableSessionRefresh: true,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: LINK_HOURS * HOUR_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // Activation and "forgot password" share the reset link. Someone who
      // has never set a password gets the activation wording. The email goes
      // out after the response, which then takes about as long whether or
      // not the address has an account.
      sendResetPassword: async ({ user, url }) => {
        const account = await db().user.findUnique({
          where: { id: user.id },
          select: { emailVerified: true, disabledAt: true },
        });
        // A disabled account can't sign in, so a link would only mislead.
        if (!account || account.disabledAt) return;
        const message = {
          to: user.email,
          name: user.name,
          url,
          validHours: LINK_HOURS,
        };
        sendEmailLater(
          account.emailVerified
            ? passwordResetEmail(message)
            : activationEmail(message),
        );
      },
      // Setting a password from an emailed link proves the address works.
      onPasswordReset: async ({ user }) => {
        await db().user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
      },
    },
    // Limits per client address, per minute. A college network can put
    // thousands of students behind one address, so these only slow down a
    // flood from one source.
    rateLimit: {
      enabled: true,
      // Shared by every server instance, and kept across restarts.
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 30 },
        "/request-password-reset": { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Better Auth's documented place to refuse sign-in for an account
          // that exists and has the right password.
          before: async (session) => {
            const account = await db().user.findUnique({
              where: { id: session.userId },
              select: { disabledAt: true },
            });
            if (!account || account.disabledAt) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Sign-in is turned off for this account. Contact the Registry.",
              });
            }
          },
        },
      },
    },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** The Better Auth instance, created on first use. */
export function auth(): ReturnType<typeof createAuth> {
  instance ??= createAuth();
  return instance;
}
