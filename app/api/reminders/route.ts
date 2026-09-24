/**
 * GET/POST /api/reminders — the push subscription register. See DESIGN.md §8.5.
 * Deliberately not part of `/api/sync`: a subscription is a device fact, and
 * folding it in would give every device a copy of every other's endpoint.
 *
 * `GET` answers whether this deployment can send at all, asked *before* the
 * browser's permission prompt, which can only be refused once.
 */

import { isTimeZone } from "@/lib/dates";
import { resolveUser } from "@/lib/server/auth";
import { getDb, syncConfigured } from "@/lib/server/db";
import { readJson } from "@/lib/server/json";
import { applicationServerKey, pushConfigured } from "@/lib/server/push";
import { check, tooMany } from "@/lib/server/ratelimit";
import { pushSubscriptions, users } from "@/lib/server/schema";
import { asServer, asUser } from "@/lib/server/scope";
import { and, eq } from "drizzle-orm";

/** postgres.js opens a TCP socket, and `web-push` needs Node crypto. */
export const runtime = "nodejs";

/** Both handlers read the environment and the database per request. */
export const dynamic = "force-dynamic";

/** FCM's run past 200 characters, but they are bounded. */
const MAX_ENDPOINT = 1024;
const MAX_KEY = 256;
/** An endpoint, two keys and a zone name, with room to spare. */
const MAX_BODY_BYTES = 8 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(): Promise<Response> {
  const ready = syncConfigured() && pushConfigured();
  return Response.json(
    {
      /** Both halves: reminders need an account to know whose habits they are. */
      configured: ready,
      applicationServerKey: ready ? applicationServerKey() : null,
    },
    { headers: NO_STORE },
  );
}

type Subscribe = {
  action: "subscribe";
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timeZone: string;
};

type Unsubscribe = { action: "unsubscribe"; endpoint: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKey(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= MAX_KEY
  );
}

/**
 * https only, and length-capped: this is a URL the server will request on a
 * schedule, so an unvalidated one makes the cron a request forgery primitive.
 */
function isEndpoint(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ENDPOINT
  ) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parse(body: unknown): Subscribe | Unsubscribe | null {
  if (!isObject(body) || !isEndpoint(body.endpoint)) return null;

  if (body.action === "unsubscribe") {
    return { action: "unsubscribe", endpoint: body.endpoint };
  }

  if (body.action !== "subscribe") return null;
  if (
    !isObject(body.keys) ||
    !isKey(body.keys.p256dh) ||
    !isKey(body.keys.auth)
  )
    return null;
  // Against the runtime's ICU rather than a regex: the cron formats a date in
  // this zone, and an unknown one would throw there instead.
  if (!isTimeZone(body.timeZone)) return null;

  return {
    action: "subscribe",
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    timeZone: body.timeZone,
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!syncConfigured()) {
    return error(503, "Reminders are not configured on this deployment.");
  }

  const user = await resolveUser(request);
  if (!user) return error(401, "Sign in to turn on reminders.");

  /**
   * Keyed by account, like `/api/sync`, and well above the real cadence:
   * `announce()` is a handful of writes a day. See §13.17.
   */
  const metered = await check("reminders", user.id);
  if (!metered.ok) {
    return tooMany(
      "Too many reminder updates. Try again shortly.",
      metered.retryAfter,
    );
  }

  const body = await readJson(request, MAX_BODY_BYTES);
  if (body === undefined)
    return error(400, "Body is not valid JSON, or is too large.");

  const command = parse(body);
  if (!command) return error(400, "Malformed subscription.");

  const db = getDb();

  if (command.action === "unsubscribe") {
    // Scoped to the account: deleting a device handle must be the owner's
    // call. The `user_id` clause is said twice on purpose (§13.15).
    await asUser(db, user.id, (tx) =>
      tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, command.endpoint),
            eq(pushSubscriptions.userId, user.id),
          ),
        ),
    );
    return Response.json({ subscribed: false }, { headers: NO_STORE });
  }

  if (!pushConfigured()) {
    // Refused rather than stored: a row with no keypair behind it never fires,
    // and the client has just spent the one permission prompt on it.
    return error(503, "This deployment cannot send reminders.");
  }

  // The same upsert `runSync` opens with: a device can subscribe before it has
  // ever synced, and the foreign key needs the account row.
  await asUser(db, user.id, (tx) =>
    tx
      .insert(users)
      .values({ id: user.id, email: user.email })
      .onConflictDoNothing({
        target: users.id,
      }),
  );

  // `asServer`, and it has to be: conflicting on the endpoint alone means
  // writing over a row this account's scope cannot see, and Postgres has no way
  // to say "you may take over a row you may not read". The `userId` written is
  // the session's, never the caller's to choose.
  await asServer(db, (tx) =>
    tx
      .insert(pushSubscriptions)
      .values({
        endpoint: command.endpoint,
        userId: user.id,
        p256dh: command.keys.p256dh,
        auth: command.keys.auth,
        timeZone: command.timeZone,
        lastSeenAt: new Date(),
      })
      // On the endpoint alone, which is how a device that changed hands stops
      // belonging to the previous account. `lastSentDay` is left as it was, or
      // resubscribing would produce a second reminder this morning.
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256dh: command.keys.p256dh,
          auth: command.keys.auth,
          timeZone: command.timeZone,
          // The heartbeat the sweep ages a device against: without it a browser
          // that stopped visiting looks like one used daily.
          lastSeenAt: new Date(),
        },
      }),
  );

  return Response.json({ subscribed: true }, { headers: NO_STORE });
}
