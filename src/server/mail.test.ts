import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Email } from "./mail";

const { after, createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {
    sendMail,
    createTransport: vi.fn(() => ({ sendMail })),
    after: vi.fn(),
  };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("next/server", () => ({ after }));

const EMAIL: Email = {
  to: "amelia.hart@student.example",
  subject: "Activate your Student Registry account",
  text: "Hello",
  html: "<p>Hello</p>",
};

// The module keeps its connection, and env() its settings, so each test
// imports a fresh copy.
async function loadMail() {
  vi.resetModules();
  return import("./mail");
}

describe("mail", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/app");
    vi.stubEnv("BETTER_AUTH_SECRET", "unit-tests-only-secret-0123456789abcdef");
    vi.stubEnv("SMTP_HOST", "smtp.college.example");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", undefined);
    vi.stubEnv("SMTP_PASSWORD", undefined);
    vi.stubEnv("MAIL_FROM", "Registry <registry@college.example>");
    sendMail.mockReset().mockResolvedValue(undefined);
    createTransport.mockClear();
    after.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends from MAIL_FROM through the configured server", async () => {
    const { sendEmail } = await loadMail();

    await sendEmail(EMAIL);

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.college.example",
      port: 587,
      secure: false,
      auth: undefined,
      // Seconds, not nodemailer's minutes: staff wait for enrolment emails.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Registry <registry@college.example>",
      ...EMAIL,
    });
  });

  it("uses TLS from the start on port 465, and credentials when they're set", async () => {
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "registry");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    const { sendEmail } = await loadMail();

    await sendEmail(EMAIL);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 465,
        secure: true,
        auth: { user: "registry", pass: "app-password" },
      }),
    );
  });

  it("opens the connection once", async () => {
    const { sendEmail } = await loadMail();

    await sendEmail(EMAIL);
    await sendEmail(EMAIL);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("reports a failure to send", async () => {
    sendMail.mockRejectedValue(new Error("Connection refused"));
    const { sendEmail } = await loadMail();

    await expect(sendEmail(EMAIL)).rejects.toThrow("Connection refused");
  });

  describe("sendEmailLater", () => {
    it("sends once the response has gone", async () => {
      const { sendEmailLater } = await loadMail();

      sendEmailLater(EMAIL);

      expect(sendMail).not.toHaveBeenCalled();
      const [[task]] = after.mock.calls as [[() => Promise<void>]];
      await task();
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining(EMAIL));
    });

    it("logs a failure, as nobody is waiting for it", async () => {
      sendMail.mockRejectedValue(new Error("Connection refused"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const { sendEmailLater } = await loadMail();

      sendEmailLater(EMAIL);
      const [[task]] = after.mock.calls as [[() => Promise<void>]];

      await expect(task()).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith(
        `Couldn't send the email "${EMAIL.subject}":`,
        expect.any(Error),
      );
    });
  });
});
