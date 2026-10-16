// Sends email over SMTP. In development and tests the SMTP server is Mailpit
// (see compose.yaml), which catches every message in a web inbox instead of
// delivering it; production would point SMTP_* at a real mail service.
import "server-only";

import { after } from "next/server";
import nodemailer, { type Transporter } from "nodemailer";

import { env } from "./env";

/** An email to one recipient, as plain text and HTML. */
export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | undefined;

function transport(): Transporter {
  if (!transporter) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = env();
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      // Port 465 means TLS from the start; other ports upgrade with STARTTLS
      // when the server offers it.
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends an email.
 *
 * @throws Error if the SMTP server can't be reached or refuses the message.
 */
export async function sendEmail(email: Email): Promise<void> {
  await transport().sendMail({ from: env().MAIL_FROM, ...email });
}

/**
 * Sends an email once the response has gone, so the request doesn't wait for
 * the mail server. Use it where how long a response takes mustn't reveal
 * whether an email went out. A failure is logged, as nobody is waiting to hear
 * about it. Call it while handling a request.
 */
export function sendEmailLater(email: Email): void {
  after(async () => {
    try {
      await sendEmail(email);
    } catch (error) {
      console.error(`Couldn't send the email "${email.subject}":`, error);
    }
  });
}
