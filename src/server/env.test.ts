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
    vi.stubEnv("APP_TIME_ZONE", undefined);
    vi.stubEnv("UPLOAD_DIR", undefined);
    const env = await loadEnv();

    expect(env()).toEqual({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      APP_TIME_ZONE: "Europe/London",
      UPLOAD_DIR: "./storage/uploads",
    });
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
