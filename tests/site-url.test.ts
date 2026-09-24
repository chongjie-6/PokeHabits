/**
 * Where `metadataBase` comes from (§8.6). The property worth protecting is that
 * a build with no environment set stays warning-free — every variable is
 * optional, and CI builds with none of them.
 */

import { describe, expect, it, vi } from "vitest";
import { FALLBACK_SITE_URL, siteURL } from "@/lib/site-url";

/** `ProcessEnv` requires `NODE_ENV`, which none of these cases care about. */
const env = (over: Record<string, string>) =>
  over as unknown as NodeJS.ProcessEnv;

describe("siteURL", () => {
  it("falls back to localhost when nothing says otherwise", () => {
    expect(siteURL(env({})).toString()).toBe(
      new URL(FALLBACK_SITE_URL).toString(),
    );
  });

  it("prefers an explicit SITE_URL", () => {
    const values = env({
      SITE_URL: "https://openhabits.app",
      BETTER_AUTH_URL: "https://auth.example",
      VERCEL_PROJECT_PRODUCTION_URL: "vercel.example",
    });
    expect(siteURL(values).origin).toBe("https://openhabits.app");
  });

  it("borrows the auth origin when there is no SITE_URL", () => {
    const values = env({ BETTER_AUTH_URL: "https://auth.example" });
    expect(siteURL(values).origin).toBe("https://auth.example");
  });

  it("takes Vercel's production host last, and adds the scheme it omits", () => {
    const values = env({
      VERCEL_PROJECT_PRODUCTION_URL: "openhabits.vercel.app",
    });
    expect(siteURL(values).origin).toBe("https://openhabits.vercel.app");
  });

  it("ignores a variable that is present but empty", () => {
    // An env key with nothing after the `=` yields "", which is not an origin.
    const values = env({ SITE_URL: "   ", BETTER_AUTH_URL: "" });
    expect(siteURL(values).origin).toBe(new URL(FALLBACK_SITE_URL).origin);
  });

  it("warns and falls back rather than failing the build on a typo", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const values = env({ SITE_URL: "openhabits.app" });

    // The cost of a bad origin is a wrong image URL in a link preview, not an
    // app that will not build.
    expect(siteURL(values).origin).toBe(new URL(FALLBACK_SITE_URL).origin);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
