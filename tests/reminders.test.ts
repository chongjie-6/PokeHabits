/**
 * The pure half of reminders: a wall clock in somebody else's zone, and what is
 * outstanding as a notification. `civilInZone` decides both when a reminder
 * fires and which day it lists, so the cases here are the ones that break a
 * naive offset — across the date line, behind UTC, half-hour, and a DST shift.
 */

import { describe, expect, it } from "vitest";
import { civilInZone, isTimeZone } from "@/lib/dates";
import { reminderPayload } from "@/lib/server/reminders";
import type { HabitDayState } from "@/lib/history";
import type { Habit } from "@/lib/types";

function state(
  name: string,
  over: Partial<Habit> = {},
  count = 0,
): HabitDayState {
  const habit: Habit = {
    id: name,
    name,
    emoji: "✅",
    color: "green",
    cadence: { kind: "daily" },
    target: 1,
    order: 0,
    createdAt: "2026-08-01",
    archivedAt: null,
    updatedAt: 0,
    deletedAt: null,
    ...over,
  };
  return { habit, scheduled: true, count, done: false };
}

describe("isTimeZone", () => {
  it("accepts IANA zones the runtime knows", () => {
    expect(isTimeZone("Australia/Sydney")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(9)).toBe(false);
    expect(isTimeZone("A".repeat(200))).toBe(false);
  });
});

describe("civilInZone", () => {
  it("reads the wall clock ahead of UTC, across the date boundary", () => {
    // 23:00 UTC on the 4th is 09:00 on the 5th in Sydney (UTC+10 in September).
    const at = new Date("2026-09-04T23:00:00Z");
    expect(civilInZone("Australia/Sydney", at)).toEqual({
      day: "2026-09-05",
      hour: 9,
    });
  });

  it("reads the wall clock behind UTC on the same instant", () => {
    const at = new Date("2026-09-04T23:00:00Z");
    expect(civilInZone("America/Los_Angeles", at)).toEqual({
      day: "2026-09-04",
      hour: 16,
    });
  });

  it("handles a half-hour offset", () => {
    // India is UTC+5:30 year round: 03:30 UTC is 09:00 in Kolkata.
    const at = new Date("2026-09-04T03:30:00Z");
    expect(civilInZone("Asia/Kolkata", at)).toEqual({
      day: "2026-09-04",
      hour: 9,
    });
  });

  it("follows a DST transition rather than a fixed offset", () => {
    // London is UTC+1 in July and UTC+0 in January. A stored offset would put
    // one of these an hour out, and a reminder an hour out is a reminder that
    // fires on the wrong hour's cron tick — that is, never.
    expect(
      civilInZone("Europe/London", new Date("2026-07-04T08:00:00Z")).hour,
    ).toBe(9);
    expect(
      civilInZone("Europe/London", new Date("2026-01-04T08:00:00Z")).hour,
    ).toBe(8);
  });

  it("reports midnight as hour 0, not 24", () => {
    expect(civilInZone("UTC", new Date("2026-09-04T00:15:00Z"))).toEqual({
      day: "2026-09-04",
      hour: 0,
    });
  });

  it("rolls the day back before dayStartHour, leaving the wall hour alone", () => {
    // 02:00 with a 4am rollover is still the previous day's habit list, exactly
    // as `todayKey` would have it on the device.
    expect(civilInZone("UTC", new Date("2026-09-04T02:00:00Z"), 4)).toEqual({
      day: "2026-09-03",
      hour: 2,
    });
  });

  it("leaves the day alone at and after dayStartHour", () => {
    expect(civilInZone("UTC", new Date("2026-09-04T04:00:00Z"), 4).day).toBe(
      "2026-09-04",
    );
  });
});

describe("reminderPayload", () => {
  it("names a single outstanding habit", () => {
    const payload = reminderPayload([state("Read")]);
    expect(payload.title).toBe("1 habit left today");
    expect(payload.body).toBe("✅ Read");
  });

  it("lists several, separated", () => {
    const payload = reminderPayload([
      state("Read"),
      state("Run"),
      state("Water"),
    ]);
    expect(payload.title).toBe("3 habits left today");
    expect(payload.body).toBe("✅ Read · ✅ Run · ✅ Water");
  });

  it("collapses the tail into a count rather than growing without bound", () => {
    const payload = reminderPayload(
      ["Read", "Run", "Water", "Stretch", "Write"].map((name) => state(name)),
    );
    expect(payload.title).toBe("5 habits left today");
    expect(payload.body).toBe("✅ Read · ✅ Run · ✅ Water · +2 more");
  });

  it("shows progress only for counted habits", () => {
    const payload = reminderPayload([
      state("Water", { target: 8 }, 3),
      state("Read"),
    ]);
    expect(payload.body).toBe("✅ Water 3/8 · ✅ Read");
  });

  it("drops the space where a habit has no emoji", () => {
    expect(reminderPayload([state("Read", { emoji: "" })]).body).toBe("Read");
  });

  it("uses one tag for every day, so yesterday's is replaced and not stacked", () => {
    expect(reminderPayload([state("Read")]).tag).toBe("openhabits-daily");
    expect(reminderPayload([state("Run")]).tag).toBe("openhabits-daily");
  });
});
