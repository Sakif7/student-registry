// Helpers for pages that read data through the services.
import "server-only";

import { notFound } from "next/navigation";

import { AppError } from "./errors";

/**
 * Awaits a service call, rendering the 404 page if the record doesn't exist.
 * Other errors propagate to the nearest error boundary.
 */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
    throw error;
  }
}
