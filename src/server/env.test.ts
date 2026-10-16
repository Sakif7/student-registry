import { afterEach, describe, expect, it, vi } from "vitest";

// env() caches its result, so each test imports a fresh copy of the module.
async function loadEnv() {
  vi.resetModules();
  const { env } = await import("./env");
  return env;
}

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the configuration, with defaults for optional variables", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/app");
    for (const name of [
      "APP_TIME_ZONE",
      "UPLOAD_DIR",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "MAIL_FROM",
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
    });
  });

  it("reads the SMTP port as a number and refuses an impossible one", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/app");
    vi.stubEnv("SMTP_PORT", "587");
    expect((await loadEnv())().SMTP_PORT).toBe(587);

    vi.stubEnv("SMTP_PORT", "70000");
    expect(await loadEnv()).toThrow("SMTP_PORT");
  });

  it("names every invalid variable in a single error", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://localhost/app");
    vi.stubEnv("APP_TIME_ZONE", "Mars/Olympus_Mons");
    const env = await loadEnv();

    expect(() => env()).toThrow(
      "Invalid environment configuration: DATABASE_URL must be a postgresql:// connection URL; APP_TIME_ZONE must be an IANA time zone such as Europe/London. See .env.example.",
    );
  });

  it("requires DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const env = await loadEnv();

    expect(() => env()).toThrow("DATABASE_URL is required");
  });

  it("reads the environment only once", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/first");
    const env = await loadEnv();
    const first = env();

    vi.stubEnv("DATABASE_URL", "postgresql://localhost/second");
    expect(env()).toBe(first);
  });
});
