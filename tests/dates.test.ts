import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  daysBetween,
  formatWeekRange,
  relativeDayLabel,
  startOfMonth,
  startOfWeek,
  todayKey,
  weekdayIndex,
  weekdayInitials,
  weekdayOf,
} from "@/lib/dates";

/**
 * DESIGN.md §9 calls this the file most likely to harbour bugs. Everything here
 * is a pure function of a `YYYY-MM-DD` string, so it can be pinned down exactly.
 */

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("crosses a year boundary in both directions", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("is unaffected by DST transitions", () => {
    // US spring forward (2026-03-08) and autumn back (2026-11-01). Day maths is
    // done in UTC space precisely so a 23-hour local day cannot shift a date.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("round-trips over a long span", () => {
    expect(addDays(addDays("2026-08-14", 365), -365)).toBe("2026-08-14");
  });
});

describe("daysBetween", () => {
  it("is signed and inclusive of neither end", () => {
    expect(daysBetween("2026-08-14", "2026-08-15")).toBe(1);
    expect(daysBetween("2026-08-15", "2026-08-14")).toBe(-1);
    expect(daysBetween("2026-08-14", "2026-08-14")).toBe(0);
  });

  it("counts a non-leap year as 365 days", () => {
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2028-01-01", "2029-01-01")).toBe(366);
  });

  it("survives a DST boundary", () => {
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-10-25", "2026-11-08")).toBe(14);
  });
});

describe("weekdayOf", () => {
  it("matches known dates", () => {
    expect(weekdayOf("2026-08-14")).toBe(5); // Friday
    expect(weekdayOf("2026-08-16")).toBe(0); // Sunday
    expect(weekdayOf("2026-08-17")).toBe(1); // Monday
  });
});

describe("startOfWeek", () => {
  it("respects a Monday start", () => {
    expect(startOfWeek("2026-08-14", 1)).toBe("2026-08-10"); // Fri → Mon
    expect(startOfWeek("2026-08-16", 1)).toBe("2026-08-10"); // Sun → prior Mon
    expect(startOfWeek("2026-08-17", 1)).toBe("2026-08-17"); // Mon → itself
  });

  it("respects a Sunday start", () => {
    expect(startOfWeek("2026-08-14", 0)).toBe("2026-08-09");
    expect(startOfWeek("2026-08-16", 0)).toBe("2026-08-16");
  });

  it("is idempotent", () => {
    const once = startOfWeek("2026-08-14", 1);
    expect(startOfWeek(once, 1)).toBe(once);
  });
});

describe("startOfMonth", () => {
  it("snaps to the first of the month", () => {
    expect(startOfMonth("2026-08-14")).toBe("2026-08-01");
    expect(startOfMonth("2026-08-01")).toBe("2026-08-01");
  });

  it("walks back whole months", () => {
    expect(startOfMonth("2026-08-14", 1)).toBe("2026-07-01");
    expect(startOfMonth("2026-08-14", 5)).toBe("2026-03-01");
  });

  it("crosses the year boundary", () => {
    expect(startOfMonth("2026-02-14", 3)).toBe("2025-11-01");
    expect(startOfMonth("2026-01-31", 1)).toBe("2025-12-01");
  });

  it("does not carry the day of the month into a shorter one", () => {
    // The trap this avoids: 31 January minus one month landing on 3 March.
    expect(startOfMonth("2026-03-31", 1)).toBe("2026-02-01");
  });

  it("is idempotent", () => {
    const once = startOfMonth("2026-08-14");
    expect(startOfMonth(once)).toBe(once);
  });
});

describe("formatWeekRange", () => {
  const range = (start: string) => formatWeekRange(start).replace(/\s+/g, " ");

  it("spans seven days, naming the month once within one month", () => {
    const text = range("2026-09-14");
    expect(text).toMatch(/14/);
    expect(text).toMatch(/20/);
    expect(text.match(/Sep/g)).toHaveLength(1);
  });

  it("names both months when the week crosses one", () => {
    const text = range("2026-09-28");
    expect(text).toMatch(/Sep/);
    expect(text).toMatch(/Oct/);
    expect(text).toMatch(/\b4\b/);
  });
});

describe("weekdayIndex", () => {
  it("maps a day to its column under either week start", () => {
    expect(weekdayIndex("2026-08-17", 1)).toBe(0); // Monday, Monday-start
    expect(weekdayIndex("2026-08-16", 1)).toBe(6); // Sunday is last
    expect(weekdayIndex("2026-08-16", 0)).toBe(0); // Sunday, Sunday-start
  });

  it("agrees with the header initials", () => {
    const initials = weekdayInitials(1);
    expect(initials).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(initials[weekdayIndex("2026-08-14", 1)]).toBe("F");
  });
});

describe("relativeDayLabel", () => {
  it("names the three days that have a name", () => {
    expect(relativeDayLabel("2026-08-14", "2026-08-14")).toBe("Today");
    expect(relativeDayLabel("2026-08-13", "2026-08-14")).toBe("Yesterday");
    expect(relativeDayLabel("2026-08-15", "2026-08-14")).toBe("Tomorrow");
  });

  it("leaves the rest to the caller's own date format", () => {
    expect(relativeDayLabel("2026-08-12", "2026-08-14")).toBeNull();
    expect(relativeDayLabel("2026-08-16", "2026-08-14")).toBeNull();
  });

  it("counts across a month boundary rather than by date arithmetic", () => {
    expect(relativeDayLabel("2026-07-31", "2026-08-01")).toBe("Yesterday");
    expect(relativeDayLabel("2027-01-01", "2026-12-31")).toBe("Tomorrow");
  });
});

describe("todayKey", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the local civil date, not UTC", () => {
    vi.useFakeTimers();
    // Local 23:30. In any timezone ahead of UTC this is a different UTC date,
    // which is exactly the bug the DayKey convention exists to prevent.
    vi.setSystemTime(new Date(2026, 7, 14, 23, 30));
    expect(todayKey()).toBe("2026-08-14");
  });

  it("rolls the day over at the configured hour", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 2, 30));

    expect(todayKey(0)).toBe("2026-08-14");
    expect(todayKey(4)).toBe("2026-08-13"); // 2:30am still counts as yesterday

    vi.setSystemTime(new Date(2026, 7, 14, 5, 0));
    expect(todayKey(4)).toBe("2026-08-14"); // past the rollover
  });
});
