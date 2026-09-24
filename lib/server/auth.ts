import "server-only";

/**
 * Identity for the sync endpoint: the seam, with `better-auth.ts` behind it, so
 * swapping providers rewrites `resolveUser` alone (§13.6). It fails closed —
 * anything but a valid session is a 401. `id` is half of every primary key in
 * `schema.ts`, so it must be stable for the life of the account.
 */

import type { SyncUser } from "./auth-types";
import { getAuth } from "./better-auth";

export type { SyncUser };

/**
 * The account this request syncs to, or null to refuse it. Reads the cookie off
 * `request` rather than `next/headers`, so any caller with a Request can use it.
 */
export async function resolveUser(request: Request): Promise<SyncUser | null> {
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user?.email) return null;

    return { id: session.user.id, email: session.user.email };
  } catch (cause) {
    // Logged, not thrown: a 500 tells the client to retry a broken dependency.
    console.error("openhabits: session lookup failed", cause);
    return null;
  }
}
