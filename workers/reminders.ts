/**
 * The reminder sweep's scheduler. See DESIGN.md §8.5. It knows nothing about
 * habits, timezones or push — `GET /api/cron/reminders` decides who is due —
 * and exists only because that decision is hourly. `SITE_URL` is a var in
 * wrangler.jsonc; `CRON_SECRET` is a secret, matching the deployment's own.
 */

/** The route declares `maxDuration = 60`, so past this the sweep is not coming back. */
const TIMEOUT_MS = 60_000;

/** Optional: a missing binding is a case the handler reports rather than assumes away. */
interface Env {
  SITE_URL?: string;
  CRON_SECRET?: string;
}

const scheduler = {
  /**
   * Awaited and thrown rather than logged: a throw is what marks the invocation
   * failed, and per §8.5 a reminder that silently does not fire is the worst
   * outcome available — the scheduler now being one way that can happen.
   */
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const site = (env.SITE_URL ?? "").replace(/\/$/, "");
    if (!site || !env.CRON_SECRET) {
      // Not a quiet no-op: this Worker exists only because someone deployed it
      // on purpose, so unset is broken rather than switched off.
      throw new Error(
        "openhabits: SITE_URL var or CRON_SECRET secret is unset.",
      );
    }

    const response = await fetch(`${site}/api/cron/reminders`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // The route explains itself in the body, so log it either way and fail on
    // the status alone.
    const body = await response.text();
    console.log("openhabits: sweep returned", response.status, body);

    if (!response.ok) {
      throw new Error(`openhabits: sweep returned ${response.status}`);
    }
  },
};

export default scheduler;
