/**
 * Better Auth's endpoints. See DESIGN.md §13.6. Sign-in is the one thing a
 * local-first app cannot do locally: an identity is another machine agreeing.
 *
 * `force-dynamic` is load-bearing — a prerendered GET would bake one visitor's
 * `get-session` response into the build — as is `public/sw.js` excluding
 * `/api/`, or a session check is answered from cache, offline.
 */

import { toNextJsHandler } from "better-auth/next-js";
import { syncConfigured } from "@/lib/server/db";
import { getAuth } from "@/lib/server/better-auth";
import { readJson } from "@/lib/server/json";
import {
  authTier,
  check,
  checkMail,
  clientIp,
  tooMany,
} from "@/lib/server/ratelimit";

/** postgres.js opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wrapped rather than passed as `getAuth()`, so the instance is built on the
 * first request: a deployment with no `DATABASE_URL` says so rather than
 * failing to boot.
 */
const handler = async (request: Request): Promise<Response> => {
  if (!syncConfigured()) {
    return Response.json(
      {
        error: "server-error",
        message: "Accounts are not configured on this deployment.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const refusal = await meter(request);
  if (refusal) return refusal;

  return getAuth().handler(request);
};

/**
 * The tiers beyond the per-IP one `proxy.ts` already applied (§13.17). Two
 * paths here mail whoever is named, with no session, which makes them an
 * outbound-mail primitive with somebody else's inbox on the far end. The
 * credential paths are metered for the ordinary reason: a password hash verify.
 * Returns the refusal, or `null` to continue.
 */
async function meter(request: Request): Promise<Response | null> {
  const tier = authTier(new URL(request.url).pathname);
  if (!tier) return null;

  const ip = clientIp(request.headers);

  if (tier === "credential") {
    const verdict = await check("credential", ip);
    return verdict.ok
      ? null
      : tooMany(
          "Too many attempts. Wait a moment and try again.",
          verdict.retryAfter,
        );
  }

  const verdict = await checkMail(ip, await addressOf(request));
  return verdict.ok
    ? null
    : tooMany(
        "Too many emails requested. Check your inbox and spam folder — one may already be there.",
        verdict.retryAfter,
      );
}

/**
 * So the day-long half of the mail tier follows the *recipient*, a per-IP
 * budget being defeated by rotating IPs. A clone, so the original body still
 * reaches Better Auth, whose job it is to answer for one that will not parse.
 */
async function addressOf(request: Request): Promise<string | null> {
  const body = await readJson(request.clone());
  const email = (body as { email?: unknown } | null | undefined)?.email;
  return typeof email === "string" && email.length > 0 && email.length <= 320
    ? email
    : null;
}

export const { GET, POST } = toNextJsHandler(handler);
