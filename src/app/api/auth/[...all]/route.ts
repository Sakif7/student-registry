// Better Auth's own endpoints, under /api/auth: sign-in and sign-out, the
// session, password reset and change, and the list of signed-in devices.
// Configured in src/server/auth.ts.
import { auth } from "@/server/auth";

export function GET(request: Request): Promise<Response> {
  return auth().handler(request);
}

export function POST(request: Request): Promise<Response> {
  return auth().handler(request);
}
