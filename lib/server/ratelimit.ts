import "server-only";

/**
 * Metering for the endpoints. See DESIGN.md §13.17.
 *
 * **This module fails open, and it is the only gate here that does.** An
 * unreachable store is not evidence of abuse, and a Redis outage that 429s the
 * site hands an attacker the outage as a denial of service. The limiters are
 * built at module scope so `ephemeralCache` outlives the request.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis, redisConfigured } from "./redis";

/** One prefix, so the database can be shared with the mail envelopes safely. */
const PREFIX = "openhabits:rl";

/** Long enough for a REST round trip to Upstash, short enough that failing open
 * costs less than waiting. */
const TIMEOUT_MS = 1500;

export type Tier =
  /** Every `/api` request, keyed by IP. The generous one. */
  | "global"
  /** Auth paths that cause mail to be sent. Keyed by IP, and by address. */
  | "mail"
  /** Auth paths that verify or set a credential. Keyed by IP. */
  | "credential"
  /** `POST /api/sync`, keyed by account. */
  | "sync"
  /** `POST /api/reminders`, keyed by account. */
  | "reminders";

type Limiters = { tiers: Record<Tier, Ratelimit>; mailDaily: Ratelimit };

const globalForLimits = globalThis as unknown as {
  openHabitsLimiters?: Limiters;
};

function build(): Limiters {
  const shared = { redis: getRedis(), timeout: TIMEOUT_MS, analytics: true };
  const window = (
    tokens: number,
    span: Parameters<typeof Ratelimit.slidingWindow>[1],
  ) => Ratelimit.slidingWindow(tokens, span);

  return {
    tiers: {
      /**
       * Far above anything the app does — chosen so nobody using it ever meets
       * the limit, which is what makes it safe in front of everything.
       */
      global: new Ratelimit({
        ...shared,
        prefix: `${PREFIX}:global`,
        limiter: window(300, "60 s"),
      }),

      /** The tightest tier: these paths spend an SMTP quota and someone else's inbox. */
      mail: new Ratelimit({
        ...shared,
        prefix: `${PREFIX}:mail`,
        limiter: window(3, "60 s"),
      }),

      /** Each of these is a password hash verify, and the shape of a brute force. */
      credential: new Ratelimit({
        ...shared,
        prefix: `${PREFIX}:cred`,
        limiter: window(10, "60 s"),
      }),

      /**
       * Well above the client's cadence; what it bounds is the account-wide
       * advisory lock and a full-history pull asked for in a loop.
       */
      sync: new Ratelimit({
        ...shared,
        prefix: `${PREFIX}:sync`,
        limiter: window(60, "60 s"),
      }),

      reminders: new Ratelimit({
        ...shared,
        prefix: `${PREFIX}:rem`,
        limiter: window(30, "60 s"),
      }),
    },

    /**
     * The half that matters: a per-IP budget is defeated by rotating IPs, and
     * what is worth preventing is one address being mailed over and over.
     */
    mailDaily: new Ratelimit({
      ...shared,
      prefix: `${PREFIX}:mail-daily`,
      limiter: window(10, "24 h"),
    }),
  };
}

function limiters(): Limiters {
  // A local and a re-read rather than `??=`, for the reason `getAuth` does it:
  // a mutable property on a global is not narrowed by the assignment.
  const existing = globalForLimits.openHabitsLimiters;
  if (existing) return existing;

  const built = build();
  globalForLimits.openHabitsLimiters = built;
  return built;
}

/** Whether metering is configured at all. The store is the only requirement. */
export function rateLimitConfigured(): boolean {
  return redisConfigured();
}

/**
 * The caller's address; `NextRequest.ip` was removed in Next 15. Only the first
 * `x-forwarded-for` entry counts, and only because Vercel's proxy overwrites
 * the header — behind a proxy that appends, revisit this.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

/** Better Auth paths that send mail. */
const MAIL_PATHS = new Set([
  "send-verification-email",
  "request-password-reset",
  "forget-password",
]);

/** Better Auth paths that verify or set a credential. */
const CREDENTIAL_PATHS = new Set([
  "sign-in/email",
  "sign-up/email",
  "reset-password",
]);

/**
 * Which tier an `/api/auth/…` path falls into; `null` for the rest, which the
 * global tier covers. Matched on the tail, and kept pure so the mapping is
 * testable without a store.
 */
export function authTier(pathname: string): Tier | null {
  const tail = pathname.replace(/^\/api\/auth\//, "").replace(/\/+$/, "");
  if (MAIL_PATHS.has(tail)) return "mail";
  if (CREDENTIAL_PATHS.has(tail)) return "credential";
  return null;
}

/**
 * The single statement of which endpoints are excluded: both are
 * machine-authenticated on a schedule the app does not control, so a limiter
 * could only refuse a legitimate request. `proxy.ts`'s matcher must agree.
 */
export function metered(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  return pathname !== "/api/email" && !pathname.startsWith("/api/cron/");
}

export type Verdict = { ok: true } | { ok: false; retryAfter: number };

const ALLOWED: Verdict = { ok: true };

/** Floored at one: a `Retry-After: 0` invites the retry it is meant to delay. */
function secondsUntil(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

/** Allows the request when metering is off, unattributable, or unanswerable. */
export async function check(
  tier: Tier,
  identifier: string | null,
): Promise<Verdict> {
  if (!rateLimitConfigured() || !identifier) return ALLOWED;

  try {
    const { success, reset } = await limiters().tiers[tier].limit(identifier);
    return success ? ALLOWED : { ok: false, retryAfter: secondsUntil(reset) };
  } catch (cause) {
    console.error(`[openhabits] rate limit check failed (${tier})`, cause);
    return ALLOWED;
  }
}

/**
 * Both halves: the per-minute budget follows the caller, the daily one the
 * address, and either can refuse. `address` is optional because the body it
 * comes from may not have parsed, which is Better Auth's to answer for.
 */
export async function checkMail(
  ip: string | null,
  address: string | null,
): Promise<Verdict> {
  const perIp = await check("mail", ip);
  if (!perIp.ok) return perIp;

  if (!rateLimitConfigured() || !address) return ALLOWED;

  try {
    // Lower-cased so the budget follows the address rather than its spelling.
    const { success, reset } = await limiters().mailDaily.limit(
      address.trim().toLowerCase(),
    );
    return success ? ALLOWED : { ok: false, retryAfter: secondsUntil(reset) };
  } catch (cause) {
    console.error("[openhabits] rate limit check failed (mail-daily)", cause);
    return ALLOWED;
  }
}

/** `no-store` because a cached 429 would outlive the window it describes. */
export function tooMany(message: string, seconds: number): Response {
  return Response.json(
    { error: "rate-limited", message },
    {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": String(seconds) },
    },
  );
}
