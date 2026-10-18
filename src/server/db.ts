// Prisma client for the app: one connection pool per server process, created
// on first use so that importing this module never requires a database URL.
import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { SESSION_OPTIONS } from "@/lib/postgres";

import { env } from "./env";

// Kept on globalThis so that hot reloads in development reuse the pool instead
// of opening a new one on every edit.
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

/** Returns the shared Prisma client, creating it on first use. */
export function db(): PrismaClient {
  globalForPrisma.prisma ??= new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env().DATABASE_URL,
      // node-postgres otherwise waits forever for a free connection.
      connectionTimeoutMillis: 5_000,
      options: SESSION_OPTIONS,
    }),
  });
  return globalForPrisma.prisma;
}
