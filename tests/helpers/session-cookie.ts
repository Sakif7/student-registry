// Session cookies as Better Auth makes them, for tests that sign people in
// without the sign-in form: a random token, stored in the sessions table, and
// sent back signed with the app's secret.
import { randomBytes } from "node:crypto";

import { makeSignature } from "better-auth/crypto";

/** The session cookie's name: Better Auth's, with the app's prefix. */
export const SESSION_COOKIE = "registry.session_token";

/** A new, unguessable session token. */
export function newSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

/** A session token signed with the secret, as the cookie's value. */
export async function sessionCookieValue(
  token: string,
  secret: string,
): Promise<string> {
  return encodeURIComponent(`${token}.${await makeSignature(token, secret)}`);
}
