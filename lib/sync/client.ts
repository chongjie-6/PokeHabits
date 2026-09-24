"use client";

/**
 * The client half of sync. See DESIGN.md §13. Runs beside the app, not inside
 * it: nothing in the UI awaits a sync and every mutation lands in IndexedDB
 * first, which is what keeps the app usable offline and signed out.
 */

import { useEffect } from "react";
import { useOffline } from "next/offline";
import { markSignedOut, signedIn, useSignedIn } from "../session";
import * as store from "../store";
import { collectPush, mergeIncoming, watermarkAfterPush } from "./merge";
import {
  MAX_CLOCK_SKEW_MS,
  type SyncErrorBody,
  type SyncPull,
  type SyncPush,
} from "./protocol";

/**
 * For the bug that leaves `more` stuck true. A sync that gives up is
 * repairable, a hot loop on someone's phone is not.
 */
const MAX_ROUND_TRIPS = 50;

let inFlight: Promise<void> | null = null;

/**
 * Single-flight: two overlapping syncs would each read the cursor before the
 * other wrote it, and the second to finish would save the older one.
 */
export function syncNow(): Promise<void> {
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<void> {
  if (!syncEnabled()) {
    // Guarded here too, so a direct `syncNow()` cannot post for a signed-out
    // device just because it skipped the hook.
    store.setSyncStatus({ kind: "off" });
    return;
  }

  if (offline) {
    // Not an error: `useSync` calls back the moment connectivity returns.
    return;
  }

  store.setSyncStatus({ kind: "syncing" });

  try {
    for (let trip = 0; trip < MAX_ROUND_TRIPS; trip++) {
      const outcome = await roundTrip();

      if (outcome.kind === "stop") {
        store.setSyncStatus(outcome.status);
        return;
      }
      if (outcome.kind === "retry") continue;
      if (!outcome.more) break;
    }

    store.setSyncStatus({ kind: "idle" });
  } catch (cause) {
    // A failed sync is not a failed app — the data is on the device either way.
    console.error("openhabits: sync failed", cause);
    store.setSyncStatus({
      kind: "error",
      message: "Could not reach the server.",
    });
  }
}

type Outcome =
  | { kind: "ok"; more: boolean }
  /** Local state was reset; go round again from the new baseline. */
  | { kind: "retry" }
  | { kind: "stop"; status: store.SyncStatus };

async function roundTrip(): Promise<Outcome> {
  const meta = store.syncMeta();
  const before = store.localSnapshot();

  // A device that has never synced pulls first, which cannot put local data
  // anywhere it should not go.
  const pending =
    meta.accountId === null
      ? { habits: [], entries: [], settings: null, complete: false }
      : collectPush(before, meta.pushedThrough);

  const body: SyncPush = {
    since: meta.cursor,
    accountId: meta.accountId,
    habits: pending.habits,
    entries: pending.entries,
    settings: pending.settings,
  };

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // The user's habit history is not something to leave in a shared cache.
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) return handleError(response);

  const pull: SyncPull = await response.json();
  warnOnClockSkew(pull.serverNow);

  if (meta.accountId !== null && pull.accountId !== meta.accountId) {
    // The 409 path should have caught this; applying another account's payload
    // is worth the extra check.
    store.adoptAccount(pull.accountId);
    return { kind: "retry" };
  }

  // Re-read rather than reusing `before`: a tick landing mid-request would be
  // dropped by merging into a stale snapshot.
  const merged = mergeIncoming(store.localSnapshot(), pull);

  store.applyPulled(merged, {
    cursor: pull.seq,
    // Past everything sent, rejected records included: the winning version is
    // in this same response, and retrying dropped orphans would wedge sync.
    pushedThrough: watermarkAfterPush(pending, meta.pushedThrough),
    lastSyncAt: Date.now(),
    accountId: pull.accountId,
  });

  return { kind: "ok", more: pull.more || !pending.complete };
}

async function handleError(response: Response): Promise<Outcome> {
  const body = (await response
    .json()
    .catch(() => null)) as SyncErrorBody | null;

  switch (response.status) {
    case 401:
      // Clearing the hint is what makes `syncEnabled()` safe to trust: an
      // expired session would otherwise retry on every foreground event.
      markSignedOut();
      return { kind: "stop", status: { kind: "off" } };

    case 409:
      // Someone else is signed in here: cleared, never merged or uploaded.
      store.adoptAccount(null);
      return { kind: "retry" };

    case 429:
      /**
       * Metered, not refused (§13.17). Not the 401 path, which would sign a
       * device out for being busy, and not `retry`, which loops immediately —
       * the run stops and `useSync` calls back once the window has moved.
       */
      return {
        kind: "stop",
        status: {
          kind: "error",
          message: "Syncing too often; this device will try again shortly.",
        },
      };

    case 503:
      return { kind: "stop", status: { kind: "off" } };

    case 400:
    case 413:
      // Rejected every time, so retrying only burns battery: a client bug.
      console.error(
        "openhabits: server rejected the sync payload",
        body?.message,
      );
      return {
        kind: "stop",
        status: {
          kind: "error",
          message: "This device's data could not be synced.",
        },
      };

    default:
      return {
        kind: "stop",
        status: { kind: "error", message: "Could not reach the server." },
      };
  }
}

/**
 * Skew far enough out to break merge ordering: an hour behind, every edit here
 * loses. Only the OS can fix it, so this logs rather than acts.
 */
function warnOnClockSkew(serverNow: number): void {
  const skew = Math.abs(Date.now() - serverNow);
  if (skew > MAX_CLOCK_SKEW_MS) {
    console.warn(
      `openhabits: this device's clock is ${Math.round(skew / 60000)} minutes off the server. ` +
        "Edits may merge in the wrong order until it is corrected.",
    );
  }
}

/**
 * Mirrored where `run()` can read it synchronously (§13.14), since `useOffline`
 * is a hook and `syncNow()` is callable from anywhere. Defaults to online: the
 * worst case is one request that fails and is retried.
 */
let offline = false;

/** Long on purpose: the triggers that matter are the event-driven ones below. */
const POLL_MS = 5 * 60 * 1000;

/**
 * Only a hint, per device rather than per build: the server still decides, and
 * a device that lies to itself here gets a 401 and is switched off.
 */
function syncEnabled(): boolean {
  return signedIn();
}

/**
 * Mount once, high in the tree, alongside `useHydrate`. Not on every mutation:
 * the merge is designed to arrive late rather than often.
 */
export function useSync(): void {
  const { hydrated } = store.useOpenHabits();
  // Subscribed rather than read, so another tab signing out tears this one down.
  const enabled = useSignedIn();
  /**
   * Polls the origin, unlike `navigator.onLine`, which believes a captive
   * portal is a connection. A dependency rather than a listener: coming back
   * online re-runs the effect, whose first act is a sync.
   */
  const isOffline = useOffline();

  useEffect(() => {
    offline = isOffline;
    if (!enabled) return;
    // Syncing before hydration pushes an empty snapshot and a cursor of 0.
    if (!hydrated) return;

    void syncNow();

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    const timer = window.setInterval(() => void syncNow(), POLL_MS);

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [hydrated, enabled, isOffline]);
}
