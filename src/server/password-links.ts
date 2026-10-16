// Password links, for activation and resets, as Better Auth stores them: a
// row in `verifications` whose identifier starts with "reset-password:" and
// whose value is the account's user ID.
import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/** The stored links of one account, to count, find or delete them. */
export function passwordLinksOf(userId: string): Prisma.VerificationWhereInput {
  return { value: userId, identifier: { startsWith: "reset-password:" } };
}
