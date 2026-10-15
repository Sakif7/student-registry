// Shows errors the API returned next to the form fields they belong to.
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { ApiError } from "@/lib/api-client";

/**
 * Puts each field error from the API on the matching form field. The API and
 * the forms validate with the same schemas, so field names match.
 */
export function applyServerErrors<Values extends FieldValues>(
  setError: UseFormSetError<Values>,
  error: ApiError,
): void {
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const [message] = messages;
    if (message) setError(field as Path<Values>, { type: "server", message });
  }
}
