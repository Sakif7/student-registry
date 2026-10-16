// Server configuration from environment variables, validated on first use.
// Reading lazily means importing a server module (as `next build` does) never
// requires a database URL; the first request that needs one fails loudly.
import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string({ error: "is required" })
    .regex(/^postgres(ql)?:\/\//, "must be a postgresql:// connection URL"),
  APP_TIME_ZONE: z
    .string()
    .default("Europe/London")
    .refine(isTimeZone, "must be an IANA time zone such as Europe/London"),
  UPLOAD_DIR: z.string().min(1).default("./storage/uploads"),
  // Outgoing email. The defaults point at Mailpit from compose.yaml.
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z
    .string()
    .min(1)
    .default("Student Registry <registry@college.example>"),
  // Sign-in (Better Auth). The secret signs session cookies and tokens.
  BETTER_AUTH_SECRET: z
    .string({ error: "is required" })
    .min(32, "must be at least 32 characters (e.g. openssl rand -base64 32)"),
  /** The app's public address, used in emailed links. */
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  /** Show the demo logins on the sign-in page (never in a real deployment). */
  SHOW_DEMO_ACCOUNTS: z.stringbool().default(false),
});

/** Validated server configuration. */
export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Returns the validated configuration, parsing `process.env` on first call.
 *
 * @throws Error naming every missing or invalid variable.
 */
export function env(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(
      `Invalid environment configuration: ${problems}. See .env.example.`,
    );
  }
  cached = result.data;
  return cached;
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch (error) {
    // Intl signals an unknown time zone with a RangeError; anything else is a
    // genuine fault and must not be mistaken for bad configuration.
    if (error instanceof RangeError) return false;
    throw error;
  }
}
