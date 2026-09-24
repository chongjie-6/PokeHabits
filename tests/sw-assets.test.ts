/**
 * The asset cache sweep in `public/sw.js` (§8.2). The worker is a plain script,
 * so it runs in a VM context against an in-memory `caches` — enough to reach
 * its top-level functions and its fetch listener without a browser.
 */

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://openhabits.test";
const DAY = 24 * 60 * 60 * 1000;
const USED = "x-openhabits-used";

class MemoryCache {
  entries = new Map<string, Response>();

  async match(request: RequestInfo) {
    return this.entries.get(key(request))?.clone();
  }
  async put(request: RequestInfo, response: Response) {
    this.entries.set(key(request), response);
  }
  async delete(request: RequestInfo) {
    return this.entries.delete(key(request));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}

function key(request: RequestInfo) {
  return new URL(typeof request === "string" ? request : request.url, ORIGIN)
    .href;
}

function boot() {
  const stores = new Map<string, MemoryCache>();
  const listeners: Record<string, (event: unknown) => void> = {};

  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name)!;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(request: RequestInfo) {
      for (const store of stores.values()) {
        const hit = await store.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const sandbox: Record<string, unknown> = {
    self: {
      location: new URL(ORIGIN),
      addEventListener: (type: string, fn: (event: unknown) => void) =>
        (listeners[type] = fn),
    },
    caches,
    fetch: async () => new Response("network"),
    Request,
    Response,
    Headers,
    URL,
  };
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    sandbox,
  );

  // Top-level `const`s are not properties of the sandbox, but a second script
  // in the same context can still name them.
  return {
    listeners,
    assets: () => caches.open(runInNewContext("ASSETS", sandbox)),
    shell: () => caches.open(runInNewContext("SHELL", sandbox)),
    sweep: () => (sandbox.sweepAssets as () => Promise<void>)(),
  };
}

function asset(headers: Record<string, string>) {
  return new Response("body", { headers });
}

async function cachedPaths(cache: MemoryCache) {
  return (await cache.keys()).map((r) => new URL(r.url).pathname).sort();
}

describe("the asset cache sweep", () => {
  it("drops what nothing has asked for in a month and keeps the rest", async () => {
    const sw = boot();
    const assets = await sw.assets();
    await assets.put(
      `${ORIGIN}/_next/static/chunks/old.js`,
      asset({ [USED]: String(Date.now() - 40 * DAY) }),
    );
    await assets.put(
      `${ORIGIN}/_next/static/chunks/new.js`,
      asset({ [USED]: String(Date.now() - DAY) }),
    );

    await sw.sweep();

    expect(await cachedPaths(assets)).toEqual(["/_next/static/chunks/new.js"]);
  });

  it("keeps whatever the cached shell names, however long unused", async () => {
    const sw = boot();
    const [assets, shell] = await Promise.all([sw.assets(), sw.shell()]);
    await shell.put(
      `${ORIGIN}/stats`,
      new Response(
        `<script src="/_next/static/chunks/entry.js?dpl=dpl_1"></script>` +
          `<script>self.__next_f.push([1,"{\\"c\\":\\"/_next/static/chunks/lazy.js\\"}"])</script>`,
      ),
    );
    const stale = String(Date.now() - 400 * DAY);
    await assets.put(
      `${ORIGIN}/_next/static/chunks/entry.js?dpl=dpl_1`,
      asset({ [USED]: stale }),
    );
    await assets.put(
      `${ORIGIN}/_next/static/chunks/lazy.js`,
      asset({ [USED]: stale }),
    );
    await assets.put(
      `${ORIGIN}/_next/static/chunks/gone.js`,
      asset({ [USED]: stale }),
    );

    await sw.sweep();

    expect(await cachedPaths(assets)).toEqual([
      "/_next/static/chunks/entry.js",
      "/_next/static/chunks/lazy.js",
    ]);
  });

  it("ages an entry stored before stamping by its Date header", async () => {
    const sw = boot();
    const assets = await sw.assets();
    await assets.put(
      `${ORIGIN}/_next/static/chunks/legacy-old.js`,
      asset({ date: new Date(Date.now() - 90 * DAY).toUTCString() }),
    );
    await assets.put(
      `${ORIGIN}/_next/static/chunks/legacy-new.js`,
      asset({ date: new Date().toUTCString() }),
    );
    await assets.put(`${ORIGIN}/_next/static/chunks/undated.js`, asset({}));

    await sw.sweep();

    expect(await cachedPaths(assets)).toEqual([
      "/_next/static/chunks/legacy-new.js",
    ]);
  });

  it("restamps a cache hit so an asset in use is never swept", async () => {
    const sw = boot();
    const assets = await sw.assets();
    const url = `${ORIGIN}/_next/static/chunks/used.js`;
    await assets.put(url, asset({ [USED]: String(Date.now() - 20 * DAY) }));

    const pending: Promise<unknown>[] = [];
    let served: Promise<Response> | undefined;
    sw.listeners.fetch({
      request: new Request(url),
      respondWith: (p: Promise<Response>) => (served = p),
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    expect(await (await served!).text()).toBe("body");
    await Promise.all(pending);

    const stamp = Number((await assets.match(url))!.headers.get(USED));
    expect(Date.now() - stamp).toBeLessThan(DAY);
  });

  it("stamps what it stores from the network", async () => {
    const sw = boot();
    const url = `${ORIGIN}/_next/static/chunks/fresh.js`;

    const pending: Promise<unknown>[] = [];
    let served: Promise<Response> | undefined;
    sw.listeners.fetch({
      request: new Request(url),
      respondWith: (p: Promise<Response>) => (served = p),
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    await served;
    await Promise.all(pending);

    const stored = await (await sw.assets()).match(url);
    expect(Number(stored!.headers.get(USED))).toBeGreaterThan(Date.now() - DAY);
    expect(await stored!.text()).toBe("network");
  });
});
