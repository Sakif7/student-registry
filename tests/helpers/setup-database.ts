// Runs in every integration test file: each test starts from empty tables, and
// the connection pool is closed when the file finishes.
import { afterAll, beforeEach } from "vitest";

import { db } from "@/server/db";

import {
  assertTestDatabaseUrl,
  TRUNCATE_ALL_TABLES_SQL,
} from "./test-database";

assertTestDatabaseUrl(process.env.DATABASE_URL);

beforeEach(async () => {
  await db().$executeRawUnsafe(TRUNCATE_ALL_TABLES_SQL);
});

afterAll(async () => {
  await db().$disconnect();
});
