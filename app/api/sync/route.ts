/**
 * POST /api/sync — the only endpoint that touches replicated data. See
 * DESIGN.md §13. Push and pull in one round trip, or the client's cursor and
 * the server's contents describe different worlds. No `GET /habits`, no
 * per-record write: IndexedDB is the source of truth and this replicates it.
 */

import { resolveUser } from "@/lib/server/auth";
import { getDb, syncConfigured } from "@/lib/server/db";
import { readJson } from "@/lib/server/json";
import { check } from "@/lib/server/ratelimit";
import { AccountMismatchError, runSync } from "@/lib/server/sync-store";
import type { SyncErrorBody, SyncErrorCode } from "@/lib/sync/protocol";
import { parseSyncPush } from "@/lib/sync/validate";

/** postgres.js opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";

/**
 * Checked before the body is read, so an oversized request is refused rather
 * than buffered — `request.json()` on an unbounded body is free to attack.
 */
const MAX_BODY_BYTES = 2_000_000;

function error(status: number, code: SyncErrorCode, message: string): Response {
  return Response.json({ error: code, message } satisfies SyncErrorBody, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!syncConfigured()) {
    // The client reads this as "sync is off" rather than retrying forever.
    return error(
      503,
      "server-error",
      "Sync is not configured on this deployment.",
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return error(
      413,
      "payload-too-large",
      "Sync payload is too large. Send fewer records.",
    );
  }

  const user = await resolveUser(request);
  if (!user) {
    return error(401, "unauthenticated", "Sign in to sync.");
  }

  /**
   * Keyed by account, hence the placement: after the session is known and
   * before the body is read. The account is the right unit, since what this
   * bounds — the advisory lock, a full-history pull — is charged to it.
   */
  const metered = await check("sync", user.id);
  if (!metered.ok) {
    return error(
      429,
      "rate-limited",
      "Syncing too often; this device will try again shortly.",
    );
  }

  // Bounded again while reading: the header above is only what was declared,
  // and a chunked request declares nothing.
  const body = await readJson(request, MAX_BODY_BYTES);
  if (body === undefined) {
    return error(400, "malformed", "Body is not valid JSON, or is too large.");
  }

  const push = parseSyncPush(body);
  if (!push.ok) {
    return error(400, "malformed", push.message);
  }

  try {
    const result = await runSync(getDb(), user, push.value);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof AccountMismatchError) {
      // News rather than an error: the client holds someone else's data and
      // needs to hand the device over. Nothing was written.
      return error(
        409,
        "account-mismatch",
        "Local data belongs to a different account.",
      );
    }

    // In outline: a driver error can quote the SQL, and that SQL holds row values.
    console.error("openhabits: sync failed", cause);
    return error(
      500,
      "server-error",
      "Sync failed. Your data is safe on this device.",
    );
  }
}
