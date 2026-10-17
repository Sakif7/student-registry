// Sign-in with Better Auth: email and password, sessions stored in
// PostgreSQL, password-reset links by email, rate limiting, and a lock on an
// email address after repeated failed sign-ins. Nobody signs up: staff
// accounts come from prisma/seed.ts, and each student's is created at
// enrolment (see services/sign-in.ts).
//
// The instance is created on first use, like the database client, so
// importing this module (as `next build` does) needs no configuration.
import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";

import {
  LINK_HOURS,
  MAX_PASSWORD_LENGTH,
  MAX_RESET_EMAILS_PER_HOUR,
  MIN_PASSWORD_LENGTH,
  SESSION_HOURS,
  signInLockedMessage,
} from "@/domain/accounts";

import { db } from "./db";
import { activationEmail, passwordResetEmail } from "./emails";
import { env } from "./env";
import { sendEmailLater } from "./mail";
import { passwordLinksOf } from "./password-links";
import {
  claimSignInAttempt,
  forgetFailedSignIns,
  normaliseEmail,
} from "./sign-in-failures";

const HOUR_SECONDS = 60 * 60;

// While the Registry creates a link to send itself (createPasswordLink), the
// link Better Auth makes is kept here instead of being emailed.
const linkForRegistry = new AsyncLocalStorage<{ url?: string }>();

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
      // The app's own routes do these (/api/account/password and
      // /api/account/sessions): Better Auth's versions would skip the lock
      // after five wrong passwords, and list sessions' tokens.
      "/change-password",
      "/list-sessions",
      "/revoke-session",
      "/revoke-sessions",
      "/revoke-other-sessions",
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
        const forRegistry = linkForRegistry.getStore();
        if (forRegistry) {
          forRegistry.url = url;
          return;
        }
        const account = await db().user.findUnique({
          where: { id: user.id },
          select: { emailVerified: true, disabledAt: true },
        });
        // A disabled account can't sign in, so a link would only mislead.
        if (!account || account.disabledAt) return;
        // A few emails an hour at most, so the form can't flood an inbox.
        // Better Auth has already stored this link with the others.
        const linksThisHour = await db().verification.count({
          where: {
            ...passwordLinksOf(user.id),
            createdAt: { gt: new Date(Date.now() - HOUR_SECONDS * 1000) },
          },
        });
        if (linksThisHour > MAX_RESET_EMAILS_PER_HOUR) return;
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
      // Setting a password from an emailed link proves the address works,
      // and lifts any lock from failed sign-ins. Any other link the account
      // was sent stops working: whoever holds an old email can't use it to
      // set the password again.
      onPasswordReset: async ({ user }) => {
        await db().user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
        await db().verification.deleteMany({
          where: passwordLinksOf(user.id),
        });
        await forgetFailedSignIns(user.email);
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
    // Failed sign-ins also count against the email address they used,
    // wherever they come from (see src/domain/accounts.ts). A locked address
    // is refused before its password is checked. Each attempt counts as a
    // failure before the password is checked, and is forgotten if it
    // succeeds (see claimSignInAttempt).
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = normaliseEmail((ctx.body as { email?: unknown }).email);
        if (!email) return;
        const now = new Date();
        const until = await claimSignInAttempt(email, now);
        if (until) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: signInLockedMessage(until, now),
            code: "SIGN_IN_LOCKED",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = normaliseEmail((ctx.body as { email?: unknown }).email);
        if (!email) return;
        // A failed attempt was counted when it was claimed.
        if (ctx.context.newSession) await forgetFailedSignIns(email);
      }),
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

/**
 * Creates a link for setting the password of the account with this email
 * address, as "forgot password" does, but returns it instead of emailing it,
 * so that the Registry can send its own email and know whether it went.
 *
 * @param redirectTo - The page the link opens once Better Auth has checked it.
 * @throws Error if no account uses the address.
 */
export async function createPasswordLink(
  email: string,
  redirectTo: "/activate" | "/reset-password",
): Promise<string> {
  const link: { url?: string } = {};
  await linkForRegistry.run(link, () =>
    auth().api.requestPasswordReset({ body: { email, redirectTo } }),
  );
  if (!link.url) throw new Error(`No account uses ${email}.`);
  return link.url;
}
