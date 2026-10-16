// Expected failures that services raise on purpose (invalid input, missing
// permission, conflicts). The route handler wrapper turns them into HTTP
// responses; anything else is treated as a bug and logged.
import "server-only";

import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";

export type ErrorKind =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  /** A service the app depends on, such as the mail server, failed. */
  | "UNAVAILABLE";

/** Messages per field, e.g. `{ email: ["Enter a valid email address"] }`. */
export type FieldErrors = Record<string, string[]>;

const STATUS: Record<ErrorKind, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNAVAILABLE: 503,
};

/** An expected failure, with a message that is safe to show to the user. */
export class AppError extends Error {
  override readonly name = "AppError";

  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
  }

  /** The HTTP status for this kind of failure. */
  get status(): number {
    return STATUS[this.kind];
  }
}

/**
 * Validates input against a schema.
 *
 * @returns The parsed (and normalised) input.
 * @throws AppError (VALIDATION) with a message per invalid field.
 */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: FieldErrors = {};
  let formError: string | undefined;
  for (const issue of result.error.issues) {
    const field = issue.path.join(".");
    if (field === "") {
      formError ??= issue.message;
    } else {
      (fieldErrors[field] ??= []).push(issue.message);
    }
  }
  throw new AppError(
    "VALIDATION",
    formError ?? "Some fields need correcting.",
    fieldErrors,
  );
}

/**
 * The name of the unique constraint a Prisma error violated, if it is a
 * unique violation (P2002). The PostgreSQL driver adapter reports the
 * constraint under `driverAdapterError` rather than the classic `target`.
 */
export function violatedUniqueConstraint(error: unknown): string | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }
  const meta = error.meta as
    | {
        target?: string | string[];
        driverAdapterError?: { cause?: { constraint?: { index?: string } } };
      }
    | undefined;
  const fromAdapter = meta?.driverAdapterError?.cause?.constraint?.index;
  if (fromAdapter) return fromAdapter;
  const target = meta?.target;
  return Array.isArray(target) ? target.join(",") : (target ?? null);
}
