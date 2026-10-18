// Run with tsx straight after the demo data loads (see helpers.ts). Signs in
// every demo user who can sign in, as Better Auth would but without the
// sign-in form, which has tests of its own, or its rate limit: creates a
// session for each in the test database, and prints the session cookies as
// JSON, keyed by "staff" (the first demo staff member) or by student number.
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { DEMO_STAFF } from "@/lib/demo-accounts";
import { SESSION_OPTIONS } from "@/lib/postgres";

import { assertTestDatabaseUrl } from "../../tests/helpers/test-database";
import {
  newSessionToken,
  sessionCookieValue,
} from "../../tests/helpers/session-cookie";

import { E2E_AUTH_SECRET } from "./env";

const SESSION_MS = 8 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: assertTestDatabaseUrl(process.env.DATABASE_URL),
      options: SESSION_OPTIONS,
    }),
  });
  try {
    const users = await prisma.user.findMany({
      where: {
        emailVerified: true,
        disabledAt: null,
        OR: [{ role: "student" }, { email: DEMO_STAFF[0].email }],
      },
      select: { id: true, studentNumber: true },
    });
    const expiresAt = new Date(Date.now() + SESSION_MS);
    const cookies: Record<string, string> = {};
    for (const { id, studentNumber } of users) {
      const token = newSessionToken();
      await prisma.session.create({ data: { token, userId: id, expiresAt } });
      cookies[studentNumber ?? "staff"] = await sessionCookieValue(
        token,
        E2E_AUTH_SECRET,
      );
    }
    process.stdout.write(JSON.stringify(cookies));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
