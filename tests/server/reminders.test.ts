/**
 * The reminder sweep against real Postgres, the interesting parts being SQL:
 * "is distinct from" against "<>" over a null column is the difference between
 * reminding a new device on its first morning and never reminding it. The
 * sender is a stub, so nothing needs a keypair or a push service.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/server/db";
import type { PushPayload, PushResult, PushTarget } from "@/lib/server/push";
import { runReminderSweep, SUBSCRIPTION_TTL_MS } from "@/lib/server/reminders";
import * as schema from "@/lib/server/schema";
import { DEFAULT_SETTINGS, type Habit, type Settings } from "@/lib/types";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

function migrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
}

let db: Db;

beforeEach(async () => {
  const pglite = new PGlite();
  for (const sql of migrations()) {
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await pglite.exec(statement);
    }
  }
  db = drizzle(pglite, { schema }) as unknown as Db;

  await db
    .insert(schema.users)
    .values({ id: "alice", email: "alice@example.com" });
});

/** 23:00Z is 09:00 the next morning in Sydney, and 16:00 the same day in LA. */
const NINE_IN_SYDNEY = new Date("2026-09-04T23:00:00Z");
const SYDNEY_DAY = "2026-09-05";

async function addHabit(id: string, over: Partial<Habit> = {}): Promise<void> {
  await db.insert(schema.habits).values({
    userId: "alice",
    id,
    name: id,
    emoji: "✅",
    color: "green",
    cadence: { kind: "daily" },
    target: 1,
    order: 0,
    createdAt: "2026-08-01",
    archivedAt: null,
    updatedAt: 1,
    deletedAt: null,
    seq: 1,
    ...over,
  });
}

async function tick(habitId: string, date: string, count = 1): Promise<void> {
  await db
    .insert(schema.entries)
    .values({ userId: "alice", habitId, date, count, updatedAt: 1, seq: 2 });
}

async function addDevice(
  endpoint: string,
  timeZone: string,
  lastSentDay: string | null = null,
  lastSeenAt: Date = new Date(),
): Promise<void> {
  await db.insert(schema.pushSubscriptions).values({
    endpoint,
    userId: "alice",
    p256dh: "p",
    auth: "a",
    timeZone,
    lastSentDay,
    lastSeenAt,
  });
}

async function endpoints(): Promise<string[]> {
  const rows = await db
    .select({ endpoint: schema.pushSubscriptions.endpoint })
    .from(schema.pushSubscriptions);
  return rows.map((row) => row.endpoint).sort();
}

async function setSettings(over: Partial<Settings>): Promise<void> {
  await db.insert(schema.settings).values({
    userId: "alice",
    value: { ...DEFAULT_SETTINGS, ...over },
    updatedAt: 1,
    seq: 3,
  });
}

type Delivery = { endpoint: string; payload: PushPayload };

/** Records what would have been sent, and can be told to fail a given endpoint. */
function recorder(results: Record<string, PushResult> = {}) {
  const sent: Delivery[] = [];
  const send = async (
    target: PushTarget,
    payload: PushPayload,
  ): Promise<PushResult> => {
    const result = results[target.endpoint] ?? "sent";
    if (result === "sent") sent.push({ endpoint: target.endpoint, payload });
    return result;
  };
  return { sent, send };
}

async function lastSentDay(endpoint: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  return row?.lastSentDay ?? null;
}

describe("runReminderSweep", () => {
  it("drops a device that has not opened the app in longer than the window", async () => {
    await addHabit("read");
    const dormant = new Date(
      NINE_IN_SYDNEY.getTime() - SUBSCRIPTION_TTL_MS - 1000,
    );
    await addDevice(
      "https://push.example/dormant",
      "Australia/Sydney",
      null,
      dormant,
    );
    await addDevice("https://push.example/live", "Australia/Sydney");

    const push = recorder();
    const summary = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: push.send,
    });

    // Collected before it was ever considered, so it neither counts as a device
    // nor takes a slot from one that is still in use.
    expect(summary).toMatchObject({ expired: 1, considered: 1, sent: 1 });
    expect(await endpoints()).toEqual(["https://push.example/live"]);
    expect(push.sent.map((d) => d.endpoint)).toEqual([
      "https://push.example/live",
    ]);
  });

  it("keeps a device that has been quiet but not for long enough", async () => {
    await addHabit("read");
    const recent = new Date(
      NINE_IN_SYDNEY.getTime() - SUBSCRIPTION_TTL_MS + 60_000,
    );
    await addDevice(
      "https://push.example/sydney",
      "Australia/Sydney",
      null,
      recent,
    );

    const summary = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: recorder().send,
    });
    expect(summary).toMatchObject({ expired: 0, considered: 1, sent: 1 });
  });

  it("reminds a device for which it is nine in the morning, listing what is left", async () => {
    await addHabit("read");
    await addHabit("run", { id: "run", order: 1 });
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    const summary = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: push.send,
    });

    expect(summary).toMatchObject({
      considered: 1,
      due: 1,
      sent: 1,
      quiet: 0,
      failed: 0,
    });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].payload.title).toBe("2 habits left today");
    expect(push.sent[0].payload.body).toBe("✅ read · ✅ run");
    expect(await lastSentDay("https://push.example/sydney")).toBe(SYDNEY_DAY);
  });

  it("leaves a device alone where the same instant is the afternoon", async () => {
    await addHabit("read");
    await addDevice("https://push.example/la", "America/Los_Angeles");

    const push = recorder();
    const summary = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: push.send,
    });

    expect(summary).toMatchObject({ considered: 1, due: 0, sent: 0 });
    expect(push.sent).toEqual([]);
    expect(await lastSentDay("https://push.example/la")).toBeNull();
  });

  it("sends once when the cron fires twice for the same hour", async () => {
    await addHabit("read");
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send });
    const second = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: push.send,
    });

    expect(second).toMatchObject({ due: 0, sent: 0 });
    expect(push.sent).toHaveLength(1);
  });

  it("reminds again in the evening on a day the morning already claimed", async () => {
    await addHabit("read");
    await setSettings({ eveningReminderHour: 21 });
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send });

    // 11:00Z is 21:00 in Sydney on the same civil day.
    const evening = new Date("2026-09-05T11:00:00Z");
    expect(
      await runReminderSweep(db, { now: evening, send: push.send }),
    ).toMatchObject({ due: 1, sent: 1 });
    // The evening slot is claimed on its own column, so it too sends once.
    expect(
      await runReminderSweep(db, { now: evening, send: push.send }),
    ).toMatchObject({ due: 0, sent: 0 });

    expect(push.sent).toHaveLength(2);
    expect(await lastSentDay("https://push.example/sydney")).toBe(SYDNEY_DAY);
  });

  it("sends once when both slots land on the same hour", async () => {
    await addHabit("read");
    await setSettings({ reminderHour: 9, eveningReminderHour: 9 });
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    expect(
      await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send }),
    ).toMatchObject({ due: 1, sent: 1 });
    expect(push.sent).toHaveLength(1);
  });

  it("says nothing on a day already finished, but still spends it", async () => {
    await addHabit("read");
    await tick("read", SYDNEY_DAY);
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    const summary = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: push.send,
    });

    expect(summary).toMatchObject({ due: 1, sent: 0, quiet: 1 });
    expect(push.sent).toEqual([]);
    // Claimed even though nothing was sent: finishing early should mean silence
    // for the day, not a reminder held back until the next tick.
    expect(await lastSentDay("https://push.example/sydney")).toBe(SYDNEY_DAY);
  });

  it("honours the account's own reminder hour over the default", async () => {
    await addHabit("read");
    await setSettings({ reminderHour: 21 });
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    expect(
      await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send }),
    ).toMatchObject({
      due: 0,
    });

    // 11:00Z is 21:00 in Sydney on the same civil day.
    const evening = new Date("2026-09-05T11:00:00Z");
    expect(
      await runReminderSweep(db, { now: evening, send: push.send }),
    ).toMatchObject({
      due: 1,
      sent: 1,
    });
  });

  it("reminds at the default hour for an account whose settings never synced", async () => {
    await addHabit("read");
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    // The left join is what makes this work; an inner join would silently skip
    // every account that has pushed habits but no settings blob.
    expect(
      await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send }),
    ).toMatchObject({
      sent: 1,
    });
  });

  it("skips a habit not scheduled today", async () => {
    // 2026-09-05 is a Saturday; this habit only runs on weekdays.
    await addHabit("read");
    await addHabit("standup", {
      id: "standup",
      order: 1,
      cadence: { kind: "weekdays", days: [1, 2, 3, 4, 5] },
    });
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send });

    expect(push.sent[0].payload.body).toBe("✅ read");
  });

  it("treats a weekly habit whose quota is already met as a rest day", async () => {
    await addHabit("gym", { id: "gym", cadence: { kind: "weekly", times: 2 } });
    // The week starts Monday by default, so both of these are earlier in the
    // same week as Saturday the 5th.
    await tick("gym", "2026-09-01");
    await tick("gym", "2026-09-02");
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    expect(
      await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send }),
    ).toMatchObject({
      due: 1,
      quiet: 1,
      sent: 0,
    });
  });

  it("ignores a deleted habit", async () => {
    await addHabit("read");
    await addHabit("gone", { id: "gone", order: 1, deletedAt: 99 });
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    const push = recorder();
    await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send });

    expect(push.sent[0].payload.title).toBe("1 habit left today");
  });

  it("deletes a subscription the push service has disowned", async () => {
    await addHabit("read");
    await addDevice("https://push.example/dead", "Australia/Sydney");
    await addDevice("https://push.example/live", "Australia/Sydney");

    const push = recorder({ "https://push.example/dead": "gone" });
    const summary = await runReminderSweep(db, {
      now: NINE_IN_SYDNEY,
      send: push.send,
    });

    expect(summary).toMatchObject({ sent: 1, removed: 1 });
    const rows = await db.select().from(schema.pushSubscriptions);
    expect(rows.map((row) => row.endpoint)).toEqual([
      "https://push.example/live",
    ]);
  });

  it("keeps a subscription whose delivery merely failed", async () => {
    await addHabit("read");
    await addDevice("https://push.example/flaky", "Australia/Sydney");

    const push = recorder({ "https://push.example/flaky": "failed" });
    expect(
      await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send }),
    ).toMatchObject({
      failed: 1,
      removed: 0,
    });
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(1);
  });

  it("reminds two devices of one account on the days each is living in", async () => {
    await addHabit("read");
    await addDevice("https://push.example/sydney", "Australia/Sydney");
    // 23:00Z is 16:00 in LA, so this one is not due on the same tick.
    await addDevice("https://push.example/la", "America/Los_Angeles");

    const push = recorder();
    await runReminderSweep(db, { now: NINE_IN_SYDNEY, send: push.send });
    // 16:00Z the next day is 09:00 in LA on 2026-09-05.
    await runReminderSweep(db, {
      now: new Date("2026-09-05T16:00:00Z"),
      send: push.send,
    });

    expect(push.sent.map((delivery) => delivery.endpoint)).toEqual([
      "https://push.example/sydney",
      "https://push.example/la",
    ]);
    expect(await lastSentDay("https://push.example/la")).toBe("2026-09-05");
  });

  it("shifts the listed day back for an account with a late rollover", async () => {
    // Rollover at 4am with a reminder at 2am: the habits owed are still the
    // previous civil day's, which is what the Today tab would be showing.
    await setSettings({ dayStartHour: 4, reminderHour: 2 });
    await addHabit("read");
    await tick("read", "2026-09-05");
    await addDevice("https://push.example/sydney", "Australia/Sydney");

    // 16:00Z on the 4th is 02:00 on the 5th in Sydney, which the 4am rollover
    // still counts as the 4th — an unticked day, unlike the 5th.
    const push = recorder();
    const summary = await runReminderSweep(db, {
      now: new Date("2026-09-04T16:00:00Z"),
      send: push.send,
    });

    expect(summary).toMatchObject({ due: 1, sent: 1 });
    expect(await lastSentDay("https://push.example/sydney")).toBe("2026-09-04");
  });
});
