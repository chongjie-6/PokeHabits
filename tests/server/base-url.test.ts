/**
 * The rule in `lib/server/base-url.ts`, which decides the origin every
 * verification link is built from. See DESIGN.md §13.12.
 */

import { describe, expect, it } from "vitest";
import { resolveBaseURL } from "@/lib/server/base-url";

const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
const dev = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

describe("resolveBaseURL", () => {
  it("pins the configured URL", () => {
    expect(
      resolveBaseURL({ ...prod, BETTER_AUTH_URL: "https://openhabits.app" }),
    ).toBe("https://openhabits.app");
  });

  it("treats a blank variable as unset", () => {
    expect(resolveBaseURL({ ...dev, BETTER_AUTH_URL: "   " })).toBeUndefined();
  });

  it("refuses to infer an origin in production", () => {
    expect(() => resolveBaseURL(prod)).toThrow(/BETTER_AUTH_URL is not set/);
  });

  it("still infers in development, where the host is the developer's own", () => {
    expect(resolveBaseURL(dev)).toBeUndefined();
  });
});
