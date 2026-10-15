// Route Handler plumbing: reads the session, refuses cross-site writes, reads
// JSON bodies, and turns errors into RFC 9457 problem details, so each
// handler is only a few lines long.
import "server-only";

import { unstable_rethrow } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";

import { AppError, type FieldErrors } from "./errors";
import { type Session, sessionFromRequest } from "./session";

/** Standard reason phrases, used as problem titles. */
const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  500: "Internal Server Error",
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Handler<Context> = (
  request: NextRequest,
  context: Context,
  session: Session | null,
) => Response | Promise<Response>;

/**
 * Wraps a Route Handler: passes it the viewer's session and converts any
 * error into a problem-details response.
 */
export function handle<Context>(handler: Handler<Context>) {
  return async (request: NextRequest, context: Context): Promise<Response> => {
    // Read outside the try: when Next.js prerenders a GET handler, reading the
    // request is where it stops, by throwing an error that must not be caught.
    const session = sessionFromRequest(request);
    try {
      assertSameOrigin(request);
      return await handler(request, context, session);
    } catch (error) {
      // Let Next.js's own control-flow errors (redirects, prerender
      // bail-outs) through untouched.
      unstable_rethrow(error);
      return errorResponse(error, request);
    }
  };
}

/** A JSON success response. */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Reads a JSON request body.
 *
 * @throws AppError: UNSUPPORTED_MEDIA_TYPE unless the body is declared as
 *   JSON, VALIDATION if it isn't valid JSON.
 */
export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Send the request body as JSON, with Content-Type: application/json.",
    );
  }
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError("VALIDATION", "The request body isn't valid JSON.");
    }
    throw error;
  }
}

/**
 * Reads a multipart/form-data body, refusing one larger than `maxBytes`
 * without holding more than that in memory: a declared Content-Length is
 * checked up front, and the bytes are counted as they arrive.
 *
 * @throws AppError: UNSUPPORTED_MEDIA_TYPE unless the body is multipart,
 *   PAYLOAD_TOO_LARGE (with `tooLarge` as the message), VALIDATION if the
 *   body can't be read.
 */
export async function readFormData(
  request: Request,
  maxBytes: number,
  tooLarge: string,
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    throw new AppError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Send the file as multipart/form-data.",
    );
  }
  if (Number(request.headers.get("content-length")) > maxBytes) {
    throw new AppError("PAYLOAD_TOO_LARGE", tooLarge);
  }

  let received = 0;
  const limited = request.body?.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > maxBytes) {
          controller.error(new Error("Request body too large"));
        } else {
          controller.enqueue(chunk);
        }
      },
    }),
  );
  try {
    return await new Response(limited, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    if (received > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", tooLarge);
    throw new AppError("VALIDATION", "The upload couldn't be read.");
  }
}

/**
 * A file download. It is always an attachment, with its type stated and
 * sniffing off, so a browser never renders an uploaded file as a page.
 */
export function download(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": mimeType,
      "content-length": String(bytes.byteLength),
      "content-disposition": contentDisposition(fileName),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}

/**
 * A Content-Disposition header for downloading a file under its own name
 * (RFC 6266): an ASCII fallback, plus the exact name encoded as UTF-8.
 */
export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** An RFC 9457 problem-details response. */
export function problem(
  status: number,
  detail: string,
  instance: string,
  errors?: FieldErrors,
): NextResponse {
  return NextResponse.json(
    {
      type: "about:blank",
      title: TITLES[status] ?? "Error",
      status,
      detail,
      instance,
      ...(errors && Object.keys(errors).length > 0 ? { errors } : {}),
    },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

function errorResponse(error: unknown, request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  if (error instanceof AppError) {
    return problem(error.status, error.message, path, error.fieldErrors);
  }
  // Unexpected: log the details for us, show nothing internal to the client.
  console.error(`${request.method} ${path} failed:`, error);
  return problem(500, "Something went wrong. Please try again.", path);
}

/**
 * Refuses writes coming from another site. The session cookie is
 * SameSite=Lax, which already stops most cross-site requests; this also
 * covers browsers that send it anyway. Requests without an Origin header
 * (curl, server-to-server) are allowed.
 */
function assertSameOrigin(request: NextRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    throw new AppError("FORBIDDEN", "Cross-site requests aren't allowed.");
  }
}
