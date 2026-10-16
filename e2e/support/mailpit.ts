// The emails the app under test sends, read from Mailpit's API (see
// compose.yaml), so that tests can follow an emailed link as a person would.
import { expect } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

/** An email as Mailpit's API returns it. */
export interface Email {
  Subject: string;
  Text: string;
}

function search(address: string): string {
  const query = encodeURIComponent(`to:"${address}"`);
  return `${MAILPIT}/api/v1/search?query=${query}`;
}

/** Deletes every email to the address, so a test only sees its own. */
export async function clearInbox(address: string): Promise<void> {
  const response = await fetch(search(address), { method: "DELETE" });
  expect(response.ok, "Mailpit is running (npm run db:up)").toBe(true);
}

/** Waits for an email to the address, and returns the newest. */
export async function latestEmailTo(address: string): Promise<Email> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(search(address));
        const { messages } = (await response.json()) as {
          messages: { ID: string }[];
        };
        id = messages[0]?.ID;
        return id;
      },
      { message: `An email to ${address} arrives`, timeout: 10_000 },
    )
    .toBeDefined();
  const response = await fetch(`${MAILPIT}/api/v1/message/${id ?? ""}`);
  return (await response.json()) as Email;
}

/** The link in an email's text. */
export function linkIn(email: Email): string {
  const link = /https?:\/\/\S+/.exec(email.Text)?.[0];
  if (!link) throw new Error(`No link in "${email.Subject}".`);
  return link;
}
