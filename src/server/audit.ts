// Records the audit trail's events (see src/domain/audit.ts). Every service
// that changes something records an event in the same transaction, so the
// trail can't miss a change, or record one that was rolled back.
import "server-only";

import type { AuditEventInput } from "@/domain/audit";
import type { Prisma } from "@/generated/prisma/client";

import type { Session } from "./session";

/** The row for an event, for a transaction given as a list of writes. */
export function auditEvent(
  session: Session,
  event: AuditEventInput,
): Prisma.AuditEventUncheckedCreateInput {
  return {
    action: event.action,
    actorId: session.userId,
    studentId: event.studentId ?? null,
    details: event.details,
  };
}

/** Records who made a change, inside the transaction that makes it. */
export async function recordEvent(
  tx: Prisma.TransactionClient,
  session: Session,
  event: AuditEventInput,
): Promise<void> {
  await tx.auditEvent.create({ data: auditEvent(session, event) });
}
