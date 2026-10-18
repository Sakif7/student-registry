// Every connection to PostgreSQL uses UTC, whatever the server's own time
// zone (see src/lib/postgres.ts): the Prisma adapter sends instants without
// an offset, so a server set to London time would otherwise store them an
// hour off all summer.
import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { SESSION_OPTIONS } from "@/lib/postgres";
import { db } from "@/server/db";

import { assertTestDatabaseUrl } from "../helpers/test-database";

describe("connections to PostgreSQL", () => {
  it("use UTC, even on a server set to London time", async () => {
    const url = assertTestDatabaseUrl(process.env.DATABASE_URL);
    const name = new URL(url).pathname.slice(1);
    // Only the test database's default, put back below.
    await db().$executeRawUnsafe(
      `ALTER DATABASE "${name}" SET timezone TO 'Europe/London'`,
    );
    const connect = (options?: string) =>
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: url, options }),
      });
    const plain = connect();
    const ours = connect(SESSION_OPTIONS);
    try {
      // A new connection takes the server's setting, unless told otherwise.
      expect(await plain.$queryRaw`SHOW TimeZone`).toEqual([
        { TimeZone: "Europe/London" },
      ]);
      expect(await ours.$queryRaw`SHOW TimeZone`).toEqual([
        { TimeZone: "UTC" },
      ]);

      // So an instant sent in summer is taken as itself, where the server's
      // setting would make it an hour early.
      const deadline = new Date("2026-07-01T16:00:00.000Z");
      const stored = async (client: PrismaClient) =>
        (
          await client.$queryRaw<{ stored: string }[]>`
            SELECT to_char(${deadline}::timestamptz AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI') AS stored`
        )[0]?.stored;
      expect(await stored(ours)).toBe("2026-07-01T16:00");
      expect(await stored(plain)).toBe("2026-07-01T15:00");
    } finally {
      await db().$executeRawUnsafe(`ALTER DATABASE "${name}" RESET timezone`);
      await Promise.all([plain.$disconnect(), ours.$disconnect()]);
    }
  });
});
