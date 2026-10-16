// Sends visitors without a session cookie to the sign-in page before any
// protected page renders, remembering where they were going. This is only an
// optimistic check of the cookie's presence, as the Next.js authentication
// guide recommends: every page, service and API route still verifies the
// session against the database, so a stale or forged cookie gets nowhere.
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  const hasSessionCookie = getSessionCookie(request, {
    cookiePrefix: "registry",
  });
  if (hasSessionCookie) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const signIn = new URL("/login", request.url);
  if (pathname !== "/") signIn.searchParams.set("next", pathname + search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/", "/staff/:path*", "/student/:path*"],
};
