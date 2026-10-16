// Sorting a list by one of its columns, either way, as the list pages read
// it from their address.
import { z } from "zod";

export type SortDirection = "asc" | "desc";

/** A direction read from the URL; anything else is ignored. */
export const sortDirectionSchema = z
  .enum(["asc", "desc"])
  .optional()
  .catch(undefined);
