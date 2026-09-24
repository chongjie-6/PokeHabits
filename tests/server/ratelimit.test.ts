/**
 * The decidable half of `lib/server/ratelimit.ts` (§13.17): who a request is
 * attributed to, and which tier a path falls into. The limiters need a store,
 * which is exactly why these three functions are pure.
 */

import { describe, expect, it } from "vitest";
import { authTier, clientIp, metered } from "@/lib/server/ratelimit";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("clientIp", () => {
  it("reads a single forwarded address", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.5" }))).toBe(
      "203.0.113.5",
    );
  });

  it("takes only the first entry of a chain, which is the one the proxy wrote", () => {
    expect(
      clientIp(
        headers({
          "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178",
        }),
      ),
    ).toBe("203.0.113.5");
  });

  it("trims the whitespace a chain is written with", () => {
    expect(
      clientIp(headers({ "x-forwarded-for": "  203.0.113.5  , 70.41.3.18" })),
    ).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("prefers the forwarded chain when both are present", () => {
    expect(
      clientIp(
        headers({ "x-forwarded-for": "203.0.113.5", "x-real-ip": "10.0.0.1" }),
      ),
    ).toBe("203.0.113.5");
  });

  /**
   * `check` reads this as "allow", not "block". A request with no attributable
   * caller is not evidence of anything, and the alternative is one limiter key
   * shared by everyone the platform failed to label.
   */
  it("answers null when neither header is set", () => {
    expect(clientIp(headers({}))).toBeNull();
  });

  it("treats an empty header as unset", () => {
    expect(clientIp(headers({ "x-forwarded-for": "  " }))).toBeNull();
  });
});

describe("authTier", () => {
  it("meters the paths that send mail", () => {
    expect(authTier("/api/auth/send-verification-email")).toBe("mail");
    expect(authTier("/api/auth/request-password-reset")).toBe("mail");
    expect(authTier("/api/auth/forget-password")).toBe("mail");
  });

  it("meters the paths that verify or set a credential", () => {
    expect(authTier("/api/auth/sign-in/email")).toBe("credential");
    expect(authTier("/api/auth/sign-up/email")).toBe("credential");
    expect(authTier("/api/auth/reset-password")).toBe("credential");
  });

  /**
   * The rest of the catch-all costs nothing in particular, and the generous
   * global tier already covers it. Session reads especially: the app asks for
   * one on every foreground.
   */
  it("leaves the rest of the catch-all to the global tier", () => {
    expect(authTier("/api/auth/get-session")).toBeNull();
    expect(authTier("/api/auth/sign-out")).toBeNull();
    expect(authTier("/api/auth/verify-email")).toBeNull();
  });

  it("ignores a trailing slash", () => {
    expect(authTier("/api/auth/send-verification-email/")).toBe("mail");
  });

  /** A near miss is not a match: the sets are exact, not prefixes. */
  it("does not match a longer path that starts with a metered one", () => {
    expect(authTier("/api/auth/sign-in/email/extra")).toBeNull();
    expect(authTier("/api/auth/reset-password-somewhere")).toBeNull();
  });
});

describe("metered", () => {
  it("covers the endpoints a client calls", () => {
    expect(metered("/api/sync")).toBe(true);
    expect(metered("/api/reminders")).toBe(true);
    expect(metered("/api/auth/get-session")).toBe(true);
  });

  /**
   * Both of these are called by a machine that authenticates itself, on a
   * schedule the app does not control, so a limiter in front of either can only
   * refuse a legitimate request. `proxy.ts`'s matcher has to agree with this.
   */
  it("excludes the endpoints a machine calls", () => {
    expect(metered("/api/email")).toBe(false);
    expect(metered("/api/cron/reminders")).toBe(false);
  });

  it("leaves the static shell alone", () => {
    expect(metered("/")).toBe(false);
    expect(metered("/settings")).toBe(false);
    expect(metered("/_next/static/chunk.js")).toBe(false);
  });
});
