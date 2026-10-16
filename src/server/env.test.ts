import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "unit-tests-only-secret-0123456789abcdef";

// env() caches its result, so each test imports a fresh copy of the module.
async function loadEnv() {
  vi.resetModules();
  const { env } = await import("./env");
  return env;
}

describe("env", () => {
  beforeEach(() => {
    // The required variables, valid unless a test says otherwise.
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/app");
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the configuration, with defaults for optional variables", async () => {
    for (const name of [
      "APP_TIME_ZONE",
      "UPLOAD_DIR",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "MAIL_FROM",
      "BETTER_AUTH_URL",
      "SHOW_DEMO_ACCOUNTS",
    ]) {
      vi.stubEnv(name, undefined);
    }
    const env = await loadEnv();

    expect(env()).toEqual({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      APP_TIME_ZONE: "Europe/London",
      UPLOAD_DIR: "./storage/uploads",
      // Mailpit from compose.yaml.
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      MAIL_FROM: "Student Registry <registry@college.example>",
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: "http://localhost:3000",
      // Demo logins stay hidden unless asked for.
      SHOW_DEMO_ACCOUNTS: false,
    });
  });

  it("reads the SMTP port as a number and refuses an impossible one", async () => {
    vi.stubEnv("SMTP_PORT", "587");
    expect((await loadEnv())().SMTP_PORT).toBe(587);

    vi.stubEnv("SMTP_PORT", "70000");
    expect(await loadEnv()).toThrow("SMTP_PORT");
  });

  it("reads SHOW_DEMO_ACCOUNTS as a yes or no", async () => {
    vi.stubEnv("SHOW_DEMO_ACCOUNTS", "true");
    expect((await loadEnv())().SHOW_DEMO_ACCOUNTS).toBe(true);
    vi.stubEnv("SHOW_DEMO_ACCOUNTS", "false");
    expect((await loadEnv())().SHOW_DEMO_ACCOUNTS).toBe(false);
  });

  it("insists on a sign-in secret of at least 32 characters", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "too-short");
    expect(await loadEnv()).toThrow(
      "BETTER_AUTH_SECRET must be at least 32 characters",
    );
  });

  it("names every invalid variable in a single error", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://localhost/app");
    vi.stubEnv("APP_TIME_ZONE", "Mars/Olympus_Mons");
    const env = await loadEnv();

    expect(() => env()).toThrow(
      "Invalid environment configuration: DATABASE_URL must be a postgresql:// connection URL; APP_TIME_ZONE must be an IANA time zone such as Europe/London. See .env.example.",
    );
  });

  it("requires DATABASE_URL and BETTER_AUTH_SECRET", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("BETTER_AUTH_SECRET", undefined);
    const env = await loadEnv();

    expect(() => env()).toThrow(
      "DATABASE_URL is required; BETTER_AUTH_SECRET is required",
    );
  });

  it("reads the environment only once", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/first");
    const env = await loadEnv();
    const first = env();

    vi.stubEnv("DATABASE_URL", "postgresql://localhost/second");
    expect(env()).toBe(first);
  });
});
