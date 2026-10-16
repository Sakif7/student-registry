// Runs in every integration test file: the mailer is replaced, so emails land
// in an in-memory outbox (see outbox.ts) instead of going to an SMTP server.
// The end-to-end tests send real email to Mailpit instead.
import { beforeEach, vi } from "vitest";

import { sendEmail, sendEmailLater } from "@/server/mail";

vi.mock("@/server/mail", () => ({
  sendEmail: vi.fn(),
  sendEmailLater: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendEmail).mockResolvedValue(undefined);
  vi.mocked(sendEmailLater).mockReset();
});
