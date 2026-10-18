// The audit trail, for Registry staff: every change anyone made, newest
// first, and each student's history. Events are recorded by the services
// that make the changes (see ../audit.ts).
import "server-only";

import {
  ACTIVITY_AREA_ACTIONS,
  ACTIVITY_PAGE_SIZE,
  activityQuerySchema,
} from "@/domain/audit";
import type { Prisma } from "@/generated/prisma/client";
import { describeEvent } from "@/lib/audit";

import { db } from "../db";
import { AppError, parseInput } from "../errors";
import { containsPatterns } from "../search";
import { requireStaff, type Session } from "../session";

/** One change in the audit trail. */
export interface ActivityEntry {
  id: string;
  occurredAt: Date;
  /** Who made the change. */
  actor: { name: string; role: "staff" | "student" };
  /** What they did, as a sentence. */
  description: string;
  /** The student the change concerns, if any. */
  student: { studentNumber: string; fullName: string } | null;
}

/** A page of the activity log. */
export interface ActivityPage {
  items: ActivityEntry[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

const entrySelect = {
  id: true,
  action: true,
  details: true,
  occurredAt: true,
  actor: { select: { name: true, role: true } },
  student: { select: { studentNumber: true, fullName: true } },
} satisfies Prisma.AuditEventSelect;

type EntryRow = Prisma.AuditEventGetPayload<{ select: typeof entrySelect }>;

/**
 * Every change, newest first, a page at a time (staff only), narrowed to a
 * search of the students concerned (name or ID) and of who made the
 * changes, and to a kind of change.
 */
export async function listActivity(
  session: Session | null,
  query: unknown,
): Promise<ActivityPage> {
  requireStaff(session);
  const { page: asked, q, area } = parseInput(activityQuerySchema, query);
  const where: Prisma.AuditEventWhereInput = {
    AND: [
      area
        ? {
            OR: ACTIVITY_AREA_ACTIONS[area].map((prefix) => ({
              action: { startsWith: prefix },
            })),
          }
        : {},
      q
        ? {
            OR: containsPatterns(q).flatMap((pattern) => [
              {
                student: {
                  fullName: { contains: pattern, mode: "insensitive" as const },
                },
              },
              {
                student: {
                  studentNumber: {
                    contains: pattern,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                actor: {
                  name: { contains: pattern, mode: "insensitive" as const },
                },
              },
            ]),
          }
        : {},
    ],
  };
  const total = await db().auditEvent.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  // A page past the end (an old link, a typed number) shows the last one.
  const page = Math.min(asked, pageCount);
  const rows = await db().auditEvent.findMany({
    where,
    select: entrySelect,
    // Events recorded together keep the order they were written in.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ACTIVITY_PAGE_SIZE,
    take: ACTIVITY_PAGE_SIZE,
  });
  return {
    items: rows.map(toEntry),
    total,
    page,
    pageCount,
    pageSize: ACTIVITY_PAGE_SIZE,
  };
}

/**
 * Everything done to one student's record, newest first (staff only).
 *
 * @throws AppError: NOT_FOUND for an unknown student.
 */
export async function getStudentHistory(
  session: Session | null,
  studentNumber: string,
): Promise<ActivityEntry[]> {
  requireStaff(session);
  const number = studentNumber.toUpperCase();
  const student = await db().student.findUnique({
    where: { studentNumber: number },
    select: {
      auditEvents: {
        select: entrySelect,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      },
    },
  });
  if (!student) {
    throw new AppError("NOT_FOUND", `There is no student with ID ${number}.`);
  }
  return student.auditEvents.map(toEntry);
}

function toEntry(row: EntryRow): ActivityEntry {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    actor: {
      name: row.actor.name,
      role: row.actor.role === "student" ? "student" : "staff",
    },
    description: describeEvent(row.action, row.details),
    student: row.student,
  };
}
