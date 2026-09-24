/**
 * The one piece of build coupling `public/sw.js` carries (§8.2). A route
 * missing from its hand-written list is invisible until someone opens the app
 * on a plane, so reading `app/` back is what keeps the list honest.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Online-only flows, which a shell with no server behind it does not help. */
const ONLINE_ONLY = new Set(["/reset-password"]);

function prerenderedRoutes(dir = "app", prefix = ""): string[] {
  const routes: string[] = [];

  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (entry.isFile() && /^page\.tsx?$/.test(entry.name))
      routes.push(prefix || "/");
    if (!entry.isDirectory()) continue;
    // `api` is server-only; a bracketed segment is a route group or a dynamic
    // segment, and this app has neither in a prerendered page.
    if (
      entry.name === "api" ||
      entry.name.startsWith("[") ||
      entry.name.startsWith("(")
    )
      continue;
    routes.push(
      ...prerenderedRoutes(`${dir}/${entry.name}`, `${prefix}/${entry.name}`),
    );
  }

  return routes;
}

function precachedRoutes(): string[] {
  const source = readFileSync(join(root, "public/sw.js"), "utf8");
  const match = source.match(/const ROUTES = \[([^\]]*)\]/);
  if (!match) throw new Error("public/sw.js no longer declares a ROUTES array");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("service worker precache", () => {
  it("names every prerendered route the app can reach", () => {
    const expected = prerenderedRoutes().filter((r) => !ONLINE_ONLY.has(r));
    expect([...precachedRoutes()].sort()).toEqual([...expected].sort());
  });

  it("caches nothing under /api", () => {
    expect(precachedRoutes().some((r) => r.startsWith("/api"))).toBe(false);
  });
});
