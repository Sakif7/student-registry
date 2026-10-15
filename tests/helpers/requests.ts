// Builds requests for calling Route Handlers directly in integration tests,
// as the given viewer.
import { NextRequest } from "next/server";

import {
  serialiseSession,
  SESSION_COOKIE,
  type Session,
} from "@/server/session";

const ORIGIN = "http://localhost:3000";

export const STAFF: Session = { role: "staff" };

export function asStudent(studentNumber: string): Session {
  return { role: "student", studentNumber };
}

interface RequestOptions {
  session?: Session | null;
  /** Sent as a JSON body with the matching Content-Type. */
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}

/** A request to this app's API, as the browser would send it. */
export function apiRequest(
  method: string,
  path: string,
  options: RequestOptions = {},
): NextRequest {
  const headers = new Headers(options.headers);
  if (options.session) {
    headers.set(
      "cookie",
      `${SESSION_COOKIE}=${serialiseSession(options.session)}`,
    );
  }
  let body = options.body;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  return new NextRequest(new URL(path, ORIGIN), { method, headers, body });
}

/** The context Next.js passes to a Route Handler: params as a promise. */
export function routeContext<Params extends Record<string, string>>(
  params: Params,
): { params: Promise<Params> } {
  return { params: Promise.resolve(params) };
}

/** A response's JSON body, typed for assertions. */
export async function bodyOf<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}
