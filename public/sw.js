/**
 * OpenHabits service worker — DESIGN.md §8.2. Runtime caching plus a **route
 * precache**, the one piece of build coupling here: `ROUTES` is the complete
 * list of prerendered pages, and `tests/sw.test.ts` fails if `app/` grows one
 * this file does not name.
 *
 * Runtime caching alone failed on the router rather than the data. Every screen
 * is offline by construction, but *reaching* one is a fetch — so a route never
 * requested while online was missing, and a relaunch on `/stats` drew Today
 * under the Stats URL.
 */

const VERSION = "openhabits-v2";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const FLIGHT = `${VERSION}-flight`;
const KEEP = new Set([SHELL, ASSETS, FLIGHT]);

/**
 * Swept, not versioned: a deploy does not bump `VERSION`, and content-hashed
 * names mean each deploy's chunks land beside the last one's. So every asset
 * carries when it was last served and ages out once nothing asks for it.
 *
 * Whatever the cached shell names is exempt at any age — those are the files an
 * offline relaunch asks for first, and offline is when nothing can refill them.
 */
const ASSET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A hit rewrites its entry at most this often — a restamp copies the body. */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const USED_HEADER = "x-openhabits-used";
const ASSET_URL = /\/_next\/static\/[^"'\\\s?#)]+/g;

/**
 * Every route reachable from inside the app. `/reset-password` is absent on
 * purpose: an online-only flow, so a precached shell would have nothing behind
 * it.
 */
const ROUTES = [
  "/",
  "/week",
  "/stats",
  "/dex",
  "/settings",
  "/settings/colours",
  "/quotes",
  "/habit",
];

self.addEventListener("install", (event) => {
  // Precaching must not gate activation: a failed install leaves the previous
  // worker in charge, and a partial precache beats none.
  event.waitUntil(Promise.all([self.skipWaiting(), precache("reload")]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Both halves of a route: the document a relaunch asks for and the flight
 * payload a tab tap asks for. Failures are swallowed per route, offline at
 * install time being ordinary, and the next navigation refreshes what is missing.
 */
async function precache(cacheMode) {
  const [shell, flight] = await Promise.all([
    caches.open(SHELL),
    caches.open(FLIGHT),
  ]);

  await Promise.all(
    ROUTES.map(async (path) => {
      await Promise.all([
        fetch(path, { cache: cacheMode })
          .then((r) => (r.ok ? shell.put(routeKey(path), r) : null))
          .catch(() => null),
        fetch(path, { cache: cacheMode, headers: { RSC: "1" } })
          .then((r) => (r.ok ? putFlight(flight, path, r) : null))
          .catch(() => null),
      ]);
    }),
  );
}

/**
 * `install` fires when this file changes, not when the app behind it does, so
 * nothing else would re-run the precache. Once per worker startup, off the back
 * of a network response — about once per launch in a standalone app.
 */
let revalidated = false;
function revalidate() {
  if (revalidated) return;
  revalidated = true;
  // Conditional, not `reload`: the routes carry ETags, so only what changed
  // costs a body. The sweep waits so the exemption comes from this deploy.
  precache("no-cache")
    .then(sweepAssets)
    .catch(() => null);
}

async function sweepAssets() {
  const [assets, exempt] = await Promise.all([
    caches.open(ASSETS),
    shellAssets(),
  ]);
  const cutoff = Date.now() - ASSET_TTL_MS;

  for (const request of await assets.keys()) {
    // By pathname, so a `?dpl=` skew-protection suffix does not unprotect it.
    if (exempt.has(new URL(request.url).pathname)) continue;
    const response = await assets.match(request, { ignoreVary: true });
    if (response && lastUsed(response) >= cutoff) continue;
    await assets.delete(request, { ignoreVary: true });
  }
}

async function shellAssets() {
  const shell = await caches.open(SHELL);
  const paths = new Set();
  for (const request of await shell.keys()) {
    const response = await shell.match(request);
    if (!response) continue;
    for (const [path] of (await response.text()).matchAll(ASSET_URL))
      paths.add(path);
  }
  return paths;
}

/** Entries stored before stamping fall back to when the server sent them. */
function lastUsed(response) {
  return (
    Number(response.headers.get(USED_HEADER)) ||
    Date.parse(response.headers.get("date") ?? "")
  );
}

async function putAsset(request, response) {
  const headers = new Headers(response.headers);
  headers.set(USED_HEADER, String(Date.now()));
  const body = await response.blob();
  const cache = await caches.open(ASSETS);
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

async function touch(request, cached) {
  if (Date.now() - lastUsed(cached) < TOUCH_INTERVAL_MS) return;
  await putAsset(request, cached);
}

/**
 * Keyed by pathname, without the query: `/habit?id=…` is one static page, so
 * one entry answers every habit.
 */
function routeKey(path) {
  return new Request(new URL(path, self.location.origin).pathname);
}

/**
 * Two things stop a flight response being stored as it arrives: Next answers
 * with a 307 to a hash-stamped URL and `cache.put` refuses a redirected
 * response, and `Vary` names the router's own state-tree headers, so the entry
 * would only match a repeat of the exact request that fetched it. Rebuilding
 * the response drops both.
 */
async function putFlight(cache, path, response) {
  const headers = new Headers(response.headers);
  headers.delete("vary");
  const body = await response.blob();
  await cache.put(routeKey(path), new Response(body, { status: 200, headers }));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API: a stale session check tells a signed-out browser it is
  // signed in, offline, where nothing corrects it. Failing instead is right —
  // the network proves who you are, it does not show a habit.
  if (url.pathname.startsWith("/api/")) return;

  // Network first, so a deploy is picked up at once, with the precached
  // document as the offline fallback. `/` is the last resort for a URL this app
  // does not serve: everything it does serve is in `ROUTES`.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // A 500 stored during a deploy is what this route shows on the next
          // plane.
          if (response.ok) {
            const cache = await caches.open(SHELL);
            event.waitUntil(
              cache
                .put(routeKey(url.pathname), response.clone())
                .catch(() => null),
            );
            revalidate();
          }
          return response;
        } catch {
          const shell = await caches.open(SHELL);
          const cached =
            (await shell.match(routeKey(url.pathname))) ||
            (await shell.match(routeKey("/")));
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // The router's own fetches. Stale-while-revalidate rather than network-first:
  // these sit on every soft navigation and a static route has nothing to be
  // fresh about, so the background refresh picks a deploy up by the next tap.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(FLIGHT);
        const key = routeKey(url.pathname);
        const cached = await cache.match(key);
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok) {
              await putFlight(cache, url.pathname, response.clone());
              revalidate();
            }
            return response;
          })
          .catch(() => cached);

        // The refresh must outlive the response, or a cache hit lets the worker
        // die before the new payload lands.
        event.waitUntil(network);
        return cached ?? (await network) ?? Response.error();
      })(),
    );
    return;
  }

  // Build output is content-hashed, so it can be served from cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) {
          event.waitUntil(touch(request, cached.clone()).catch(() => null));
          return cached;
        }
        const response = await fetch(request);
        // Served forever once stored, so a 404 here is permanent for that hash.
        if (response.ok) {
          event.waitUntil(
            putAsset(request, response.clone()).catch(() => null),
          );
        }
        return response;
      })(),
    );
    return;
  }

  // Everything else same-origin: serve stale, refresh in the background.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok)
            putAsset(request, response.clone()).catch(() => null);
          return response;
        })
        .catch(() => cached);

      return cached ?? network;
    })(),
  );
});

/**
 * Reminders — DESIGN.md §8.5. The worker cannot schedule these, which is why a
 * server and an hourly cron exist; its job is to render what arrives and to put
 * the user back in the app when they tap it.
 */

const FALLBACK_TITLE = "OpenHabits";

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        // A notification is shown regardless: every delivered push must produce
        // one, and silence costs the app its permission on Chrome.
      }

      const title =
        typeof payload.title === "string" ? payload.title : FALLBACK_TITLE;
      const body =
        typeof payload.body === "string"
          ? payload.body
          : "You have habits left today.";

      await self.registration.showNotification(title, {
        body,
        // Same tag every day, so a missed morning is replaced rather than
        // stacked, and `renotify` is off: a replacement is not news.
        tag: typeof payload.tag === "string" ? payload.tag : "openhabits-daily",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: safePath(payload.url) },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const path = safePath(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const target = new URL(path, self.location.origin);
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus an open tab rather than stacking another copy of the app on itself.
      for (const client of clients) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        // Best effort: `navigate` rejects on an uncontrolled client, and the
        // focus above has done the useful half.
        if ("navigate" in client && client.url !== target.href) {
          await client.navigate(target.href).catch(() => null);
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});

/**
 * Server-authored, but it arrives over a third-party service and ends in
 * `openWindow`, so it is a same-origin path or nothing. Decided by resolving it
 * rather than by its spelling: the URL parser reads `\` as `/`, so
 * `/\evil.example` leaves the origin while starting with a single slash.
 */
function safePath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
