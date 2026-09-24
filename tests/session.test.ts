/**
 * The signed-in hint (§13.6). It carries no authority — setting it buys only a
 * request the server may 401 — and what enforces that is the 401 path clearing
 * it, so these test both halves together. `better-auth/react` is mocked out:
 * `createAuthClient()` runs at module scope and reaches for a browser.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false }),
  }),
}));

const HINT_KEY = "hapi:signed-in";

/** Just enough localStorage, plus a switch for the Safari-private case. */
function stubStorage(options: { throws?: boolean } = {}) {
  const values = new Map<string, string>();
  const guard = () => {
    if (options.throws) throw new Error("storage disabled");
  };

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => {
      guard();
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      guard();
      values.set(key, value);
    },
    removeItem: (key: string) => {
      guard();
      values.delete(key);
    },
  });
  vi.stubGlobal("window", {
    localStorage: globalThis.localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
  });

  return values;
}

type Session = typeof import("@/lib/session");

async function load(): Promise<Session> {
  vi.resetModules();
  return import("@/lib/session");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("the signed-in hint", () => {
  it("is off until something sets it", async () => {
    stubStorage();
    const session = await load();
    expect(session.signedIn()).toBe(false);
  });

  it("survives a round trip through storage", async () => {
    const values = stubStorage();
    const session = await load();

    session.markSignedIn();
    expect(session.signedIn()).toBe(true);
    expect(values.get(HINT_KEY)).toBe("1");

    session.markSignedOut();
    expect(session.signedIn()).toBe(false);
    // Removed rather than set to "0": absent and false have to be the same
    // answer, because a browser that has never seen this app has neither.
    expect(values.has(HINT_KEY)).toBe(false);
  });

  it("reads only its own exact value as a yes", async () => {
    const values = stubStorage();
    const session = await load();

    for (const value of ["", "0", "true", "yes"]) {
      values.set(HINT_KEY, value);
      expect(session.signedIn()).toBe(false);
    }
  });

  it("answers no rather than throwing when storage is unavailable", async () => {
    // Safari in private mode throws on `localStorage` rather than returning
    // null, and a thrown getter would take down the whole app for an optional
    // feature.
    stubStorage({ throws: true });
    const session = await load();

    expect(session.signedIn()).toBe(false);
    expect(() => session.markSignedIn()).not.toThrow();
    expect(session.signedIn()).toBe(false);
  });
});

describe("what the hint is worth", () => {
  it("is cleared by a 401, which is what makes it safe to trust", async () => {
    stubStorage();
    vi.resetModules();

    const session = await load();
    session.markSignedIn();
    expect(session.signedIn()).toBe(true);

    // The sync client's error path is the enforcement. A session that expired
    // while the tab was closed would otherwise retry on every foreground and
    // online event for as long as the app stayed open.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "unauthenticated", message: "no" },
          { status: 401 },
        ),
      ),
    );
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("document", {
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    const client = await import("@/lib/sync/client");
    const store = await import("@/lib/store");
    await client.syncNow();

    expect(session.signedIn()).toBe(false);
    expect(store.currentState().syncStatus).toEqual({ kind: "off" });
  });

  it("does not let a device with no hint post anything at all", async () => {
    stubStorage();
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);

    const client = await import("@/lib/sync/client");
    await client.syncNow();

    // Guarded inside `run()` as well as in `useSync`, so a direct `syncNow()`
    // cannot post for a signed-out device just because it skipped the hook.
    expect(fetched).not.toHaveBeenCalled();
  });
});
