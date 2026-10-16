// Password links, for activation and resets, as Better Auth stores them: a
// row in `verifications` whose identifier starts with "reset-password:" and
// whose value is the account's user ID.
import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/** The stored links of one or more accounts, to count, find or delete them. */
export function passwordLinksOf(
  userIds: string | readonly string[],
): Prisma.VerificationWhereInput {
  return {
    value: typeof userIds === "string" ? userIds : { in: [...userIds] },
    identifier: { startsWith: "reset-password:" },
  };
}
