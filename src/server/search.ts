// Searching the database by text, as the app's lists do.
import "server-only";

/**
 * A search as patterns for Prisma's `contains` (case-insensitive ILIKE):
 * typed % and _ are matched as themselves rather than as wildcards, and a
 * name is found whichever apostrophe it holds or is searched with
 * (O'Connor, O’Connor).
 */
export function containsPatterns(search: string): string[] {
  const text = search.replace(/[\\%_]/g, "\\$&");
  return [
    ...new Set([text, text.replaceAll("’", "'"), text.replaceAll("'", "’")]),
  ];
}
