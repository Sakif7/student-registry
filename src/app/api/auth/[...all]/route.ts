// Better Auth's own endpoints, under /api/auth: sign-in and sign-out, the
// session, and password links. Configured in src/server/auth.ts, which
// switches off the rest: the app's own routes change passwords and list
// devices.
import { auth } from "@/server/auth";

export function GET(request: Request): Promise<Response> {
  return auth().handler(request);
}

export function POST(request: Request): Promise<Response> {
  return auth().handler(request);
}
