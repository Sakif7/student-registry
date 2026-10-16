// The emails the app sends about accounts: activation for a new student, and
// a password reset. Each is plain text with a simple HTML twin, and every
// value from the database is escaped before it goes into the HTML.
import type { Email } from "./mail";

interface LinkEmail {
  to: string;
  name: string;
  /** The single-use link. */
  url: string;
  /** How long the link works for. */
  validHours: number;
}

/** Invites a newly enrolled student to set a password and sign in. */
export function activationEmail({
  to,
  name,
  url,
  validHours,
}: LinkEmail): Email {
  const intro =
    "The Registry has created your Student Registry account. Set a password to activate it, then sign in with this email address.";
  return linkEmail({
    to,
    subject: "Activate your Student Registry account",
    greeting: `Hello ${name},`,
    paragraphs: [intro],
    action: "Set your password",
    url,
    footer: `The link works once, for ${validHours} hours. If it has expired, ask the Registry to send a new one.`,
  });
}

/** Sends a link to choose a new password, after a "forgot password" request. */
export function passwordResetEmail({
  to,
  name,
  url,
  validHours,
}: LinkEmail): Email {
  return linkEmail({
    to,
    subject: "Reset your Student Registry password",
    greeting: `Hello ${name},`,
    paragraphs: [
      "Someone asked to reset the password for your Student Registry account. If it was you, choose a new password below.",
      "If it wasn't you, ignore this email: your password stays as it is.",
    ],
    action: "Choose a new password",
    url,
    footer: `The link works once, for ${validHours} hours. Choosing a new password signs you out everywhere else.`,
  });
}

function linkEmail(email: {
  to: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  action: string;
  url: string;
  footer: string;
}): Email {
  const text = [
    email.greeting,
    ...email.paragraphs,
    `${email.action}: ${email.url}`,
    email.footer,
    "Student Registry",
  ].join("\n\n");

  const html = `<!doctype html>
<html lang="en-GB">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #18181b; max-width: 32rem;">
    <p>${escapeHtml(email.greeting)}</p>
${email.paragraphs.map((paragraph) => `    <p>${escapeHtml(paragraph)}</p>`).join("\n")}
    <p><a href="${escapeHtml(email.url)}" style="display: inline-block; padding: 0.5rem 1rem; background: #18181b; color: #ffffff; border-radius: 0.375rem; text-decoration: none;">${escapeHtml(email.action)}</a></p>
    <p style="color: #52525b; font-size: 0.875rem;">${escapeHtml(email.footer)}</p>
    <p style="color: #52525b; font-size: 0.875rem;">Student Registry</p>
  </body>
</html>`;

  return { to: email.to, subject: email.subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
