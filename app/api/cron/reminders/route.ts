/**
 * GET /api/cron/reminders — the hourly reminder sweep. See DESIGN.md §8.5.
 * Hourly because "9am" is a wall clock; `workers/reminders.ts` holds the
 * schedule and calls this with the `CRON_SECRET` bearer.
 *
 * It fails closed: an unset secret is a deployment that cannot authenticate its
 * caller, and this route reads every account's habits.
 */

import { timingSafeEqual } from "node:crypto";
import { getDb, syncConfigured } from "@/lib/server/db";
import { pushConfigured } from "@/lib/server/push";
import { runReminderSweep } from "@/lib/server/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough that the sweep is the cost, short enough to fit a cron slot. */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/** Length-checked first: `timingSafeEqual` throws on a mismatch, leaking the length. */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const offered = request.headers.get("authorization");
  if (!offered) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(offered);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: "CRON_SECRET is not set; the reminder cron is disabled." },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!authorised(request)) {
    return Response.json(
      { error: "Unauthorised." },
      { status: 401, headers: NO_STORE },
    );
  }

  if (!syncConfigured() || !pushConfigured()) {
    // Not an error: the cron can be wired up with reminders switched off, and a
    // 200 keeps the scheduler from alerting every hour.
    return Response.json(
      { skipped: "Reminders are not configured on this deployment." },
      { headers: NO_STORE },
    );
  }

  try {
    const summary = await runReminderSweep(getDb());
    // Counts only: who, and which habits, must not reach a log aggregator.
    console.log("openhabits: reminder sweep", summary);
    return Response.json(summary, { headers: NO_STORE });
  } catch (cause) {
    console.error("openhabits: reminder sweep failed", cause);
    return Response.json(
      { error: "Reminder sweep failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}
