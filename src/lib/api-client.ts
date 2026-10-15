// Browser-side helper for calling the app's own API. Sends JSON or form data,
// and turns problem-details error responses into an ApiError that forms can
// show next to the right fields.

/** A failed API call, with the server's message and any per-field errors. */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Calls an API route on this site.
 *
 * @param body - Sent as JSON, or as multipart form data if it is FormData.
 * @returns The parsed JSON response, or undefined for 204 No Content.
 * @throws ApiError for any non-2xx response, or if the server can't be reached.
 */
export async function apiRequest<T = unknown>(
  method: Method,
  url: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin" };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    // fetch only rejects when no response arrived at all.
    throw new ApiError(
      0,
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) return undefined as T;
  const data = await readJsonOrNull(response);
  if (!response.ok) {
    const problem = data as {
      detail?: string;
      errors?: Record<string, string[]>;
    } | null;
    throw new ApiError(
      response.status,
      problem?.detail ?? `The request failed (${response.status}).`,
      problem?.errors,
    );
  }
  return data as T;
}

async function readJsonOrNull(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    // A non-JSON success body is a server bug; a non-JSON error body (e.g. a
    // proxy's HTML error page) still deserves the generic message.
    if (response.ok) throw error;
    return null;
  }
}
