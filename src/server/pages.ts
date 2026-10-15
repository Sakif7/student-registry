// Helpers for pages that read data through the services.
import "server-only";

import { notFound } from "next/navigation";

import { AppError } from "./errors";

/**
 * Flattens a page's search params to one value per key (the first, if a key
 * is repeated), as the services' filter schemas expect.
 */
export function firstValues(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) values[key] = first;
  }
  return values;
}

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
