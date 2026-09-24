"use client";

/**
 * The client's view of who is signed in. See DESIGN.md §13.6. Two answers that
 * look redundant and are not: Better Auth's session, authoritative and a
 * request away, and a local hint, instant and occasionally wrong, which sync
 * needs synchronously and offline. The hint carries **no authority** — it only
 * buys permission to make a request the server may 401, and that path clears
 * it. The server snapshot reports signed out (§8.4).
 */

import { useEffect, useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";

/** No `baseURL`: hardcoding one would break every deploy preview. */
export const authClient = createAuthClient();

/** Pre-rebrand key, kept: losing the hint costs a device its sync until it signs in again. */
const HINT_KEY = "hapi:signed-in";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires in *other* tabs: sign out in one, the rest stop syncing.
  const onStorage = (event: StorageEvent) => {
    if (event.key === HINT_KEY) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Whether this browser believes it has a session. Wrapped because Safari in
 * private mode throws on `localStorage` rather than returning null.
 */
export function signedIn(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function setHint(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(HINT_KEY, "1");
    else window.localStorage.removeItem(HINT_KEY);
  } catch {
    // Storage unavailable. Sync stays off; nothing else is affected.
  }
  emit();
}

export function markSignedIn(): void {
  setHint(true);
}

export function markSignedOut(): void {
  setHint(false);
}

/** Reactive `signedIn()`. Reports signed out on the server, always. */
export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribe, signedIn, () => false);
}

/**
 * Keeps the hint honest against the server: repairs one left by a session that
 * expired while the tab was closed, and sets one where the cookie outlived a
 * cleared localStorage. In an effect, since `setHint` notifies subscribers.
 */
export function useSessionSync(): void {
  const { data, isPending } = authClient.useSession();
  const present = Boolean(data?.user);

  useEffect(() => {
    if (isPending) return;
    if (signedIn() !== present) setHint(present);
  }, [present, isPending]);
}
