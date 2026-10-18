// What every list shares: reading a search and a page number from the
// address, matching a search, and cutting a list into pages.
import { z } from "zod";

/** Rows on one page of a list. */
export const LIST_PAGE_SIZE = 20;

/**
 * A search from the address: trimmed, with accented letters in one form,
 * and cut to 100 characters rather than dropped, as dropping it would list
 * everything, the opposite of what was asked. Empty means no search.
 */
export const listSearchSchema = z
  .string()
  .trim()
  .optional()
  .catch(undefined)
  .transform((value) => value?.normalize("NFC").slice(0, 100) || undefined);

/** A page number from the address. A malformed one is ignored. */
export const listPageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(10_000)
  .optional()
  .catch(undefined);

/** One page of a list, and where it sits in the whole. */
export interface ListPage<Item> {
  items: Item[];
  /** Rows on every page together. */
  total: number;
  /** From 1. */
  page: number;
  pageCount: number;
  pageSize: number;
}

/**
 * Cuts a list into pages. A page past the end, from an old link or a
 * typed number, gives the last page.
 */
export function paginate<Item>(
  items: readonly Item[],
  page = 1,
  pageSize = LIST_PAGE_SIZE,
): ListPage<Item> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    total: items.length,
    page: current,
    pageCount,
    pageSize,
  };
}

/**
 * Whether a search matches any of a row's texts, as part of it: ignoring
 * case, how accented letters were typed, and which apostrophe a name holds
 * (O'Connor, O’Connor), as the student search does.
 */
export function matchesSearch(
  search: string | undefined,
  texts: readonly (string | null | undefined)[],
): boolean {
  if (!search) return true;
  const wanted = fold(search);
  return texts.some((text) => text != null && fold(text).includes(wanted));
}

function fold(text: string): string {
  return text.normalize("NFC").replaceAll("’", "'").toLocaleLowerCase("en-GB");
}
