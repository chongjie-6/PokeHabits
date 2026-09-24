/**
 * The global rate limit tier. See DESIGN.md §13.17. `proxy.ts` rather than the
 * deprecated `middleware.ts`, and with no `runtime` export, which throws here.
 *
 * The matcher is what makes it affordable: nearly every route prerenders to
 * static HTML a CDN serves, and an unmatched proxy would put an invocation in
 * front of all of it. Scoped to `/api`, it runs only where a function already
 * would. Its verdict is the whole of its output — no module state travels.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { check, clientIp, metered, tooMany } from "@/lib/server/ratelimit";

export async function proxy(
  request: NextRequest,
): Promise<NextResponse | Response> {
  const { pathname } = request.nextUrl;

  // Here rather than in the matcher, so which endpoints are metered is stated
  // once, in a module a test can import.
  if (!metered(pathname)) return NextResponse.next();

  const verdict = await check("global", clientIp(request.headers));
  if (verdict.ok) return NextResponse.next();

  return tooMany(
    "Too many requests from this address. Your habits are safe on this device; try again shortly.",
    verdict.retryAfter,
  );
}

/**
 * Broad rather than exact on purpose: the two unmetered endpoints are excluded
 * by `ratelimit.ts:metered` inside the function, since expressing it twice
 * would mean two rules that must agree and only one that can be tested. The
 * cost is an invocation that returns without touching Redis.
 */
export const config = {
  matcher: ["/api/:path*"],
};
