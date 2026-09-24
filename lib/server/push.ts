import "server-only";

/**
 * Web Push transport. See DESIGN.md §8.5. Apart from `reminders.ts` so the
 * sweep is testable with no keypair and no push service. Configured or not,
 * answered honestly: §8.5's warning is that a "remind me at 9:00" switch which
 * silently does nothing is worse than no switch.
 */

import webpush from "web-push";

export type PushKeys = { p256dh: string; auth: string };

export type PushTarget = { endpoint: string } & { keys: PushKeys };

/**
 * `gone` is the push service disowning the endpoint, and the one outcome that
 * must reach the database — the row will never work again.
 */
export type PushResult = "sent" | "gone" | "failed";

/**
 * The contact a push service uses to reach the operator. Required by VAPID, so
 * keys without a subject are not a configured deployment.
 */
function subject(): string | null {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;

  const url = process.env.BETTER_AUTH_URL?.trim();
  return url?.startsWith("https://") ? url : null;
}

function keys(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const contact = subject();

  if (!publicKey || !privateKey || !contact) return null;
  return { publicKey, privateKey, subject: contact };
}

export function pushConfigured(): boolean {
  return keys() !== null;
}

/**
 * Public by construction, so served rather than baked in with a `NEXT_PUBLIC_`
 * variable. Fetching it also proves the server can send before the app spends
 * the one notification prompt a browser grants.
 */
export function applicationServerKey(): string | null {
  return keys()?.publicKey ?? null;
}

/** What a reminder looks like on the wire. `public/sw.js` is the other half. */
export type PushPayload = {
  title: string;
  body: string;
  /** Where a click lands. Same-origin path, never a full URL. */
  url: string;
  /** Collapse key: two reminders for a day replace rather than stack. */
  tag: string;
};

export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<PushResult> {
  const vapid = keys();
  if (!vapid) return "failed";

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: target.keys },
      JSON.stringify(payload),
      {
        vapidDetails: vapid,
        // How long an undelivered message is held: a morning reminder is stale
        // by the evening.
        TTL: 6 * 60 * 60,
        urgency: "normal",
      },
    );
    return "sent";
  } catch (cause) {
    const status = (cause as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";

    // In outline only: the error carries the endpoint and the habit names.
    console.error(`openhabits: push failed with status ${status ?? "unknown"}`);
    return "failed";
  }
}
