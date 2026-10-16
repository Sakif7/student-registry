// The emails sent during the current integration test (see setup-mail.ts).
import { vi } from "vitest";

import { type Email, sendEmail, sendEmailLater } from "@/server/mail";

/** Every email sent so far in this test, oldest first. */
export function sentEmails(): Email[] {
  return [sendEmail, sendEmailLater]
    .flatMap((send) => {
      const { calls, invocationCallOrder } = vi.mocked(send).mock;
      return calls.map(([email], index) => ({
        email,
        order: invocationCallOrder[index] ?? 0,
      }));
    })
    .sort((a, b) => a.order - b.order)
    .map(({ email }) => email);
}

/** The single-use link in an email, e.g. an activation or reset link. */
export function linkIn(email: Email): string {
  const link = /https?:\/\/\S+/.exec(email.text)?.[0];
  if (!link) throw new Error(`No link in "${email.subject}".`);
  return link;
}
