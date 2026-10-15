// Record IDs as they arrive in URLs.
import "server-only";

import { z } from "zod";

/**
 * True for a value that could be a record's primary key (a UUID). Checking
 * first turns a malformed ID into a 404 rather than a database error.
 */
export function isId(value: string): boolean {
  return z.uuid().safeParse(value).success;
}
