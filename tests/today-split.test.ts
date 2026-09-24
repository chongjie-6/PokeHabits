import { describe, expect, it } from "vitest";
import type { HabitDayState } from "@/lib/history";
import type { Habit } from "@/lib/types";
import { initialSplit, nextSplit, release, sections } from "@/lib/today-split";

function state(id: string, count: number, target = 1): HabitDayState {
  const habit: Habit = {
    id,
    name: id,
    emoji: "✅",
    color: "green",
    cadence: { kind: "daily" },
    target,
    order: 0,
    createdAt: "2026-09-01",
    archivedAt: null,
    updatedAt: 1,
    deletedAt: null,
  };
  return { habit, scheduled: true, count, done: count >= target };
}

const ids = (states: HabitDayState[]) => states.map((s) => s.habit.id);

const DAY = "2026-09-13";

describe("sections", () => {
  it("puts unfinished habits under To do and finished ones under Done, each in list order", () => {
    const states = [state("a", 1), state("b", 0), state("c", 1), state("d", 0)];
    const { todo, done } = sections(initialSplit(DAY, states), states);
    expect(ids(todo)).toEqual(["b", "d"]);
    expect(ids(done)).toEqual(["a", "c"]);
  });

  it("keeps a counted habit under To do until it reaches its target", () => {
    const states = [state("water", 5, 8)];
    expect(ids(sections(initialSplit(DAY, states), states).todo)).toEqual([
      "water",
    ]);
  });
});

describe("nextSplit", () => {
  const before = [state("a", 0), state("b", 0)];

  it("returns the same state when nothing changed, so the hook does not loop", () => {
    const split = initialSplit(DAY, before);
    expect(nextSplit(split, DAY, [...before])).toBe(split);
  });

  it("holds a ticked habit where it was until the hold is released", () => {
    const after = [state("a", 1), state("b", 0)];
    const split = nextSplit(initialSplit(DAY, before), DAY, after);

    const held = sections(split, after);
    expect(ids(held.todo)).toEqual(["a", "b"]);
    expect(held.todo[0].done).toBe(true);

    expect(ids(sections(release(split), after).done)).toEqual(["a"]);
  });

  it("keeps every row in place while ticks keep coming", () => {
    let split = initialSplit(DAY, before);
    split = nextSplit(split, DAY, [state("a", 1), state("b", 0)]);
    const both = [state("a", 1), state("b", 1)];
    split = nextSplit(split, DAY, both);

    expect(ids(sections(split, both).todo)).toEqual(["a", "b"]);
    expect(ids(sections(release(split), both).done)).toEqual(["a", "b"]);
  });

  it("leaves a mis-tap undone where it happened", () => {
    let split = initialSplit(DAY, before);
    split = nextSplit(split, DAY, [state("a", 1), state("b", 0)]);
    split = nextSplit(split, DAY, before);

    expect(ids(sections(split, before).todo)).toEqual(["a", "b"]);
    expect(ids(sections(release(split), before).todo)).toEqual(["a", "b"]);
  });

  it("renews the hold when a counted habit steps without finishing", () => {
    const start = [state("a", 0), state("water", 5, 8)];
    const ticked = [state("a", 1), state("water", 5, 8)];
    const stepped = [state("a", 1), state("water", 6, 8)];

    const first = nextSplit(initialSplit(DAY, start), DAY, ticked);
    const second = nextSplit(first, DAY, stepped);

    expect(second.held).not.toBe(first.held);
    expect(ids(sections(second, stepped).todo)).toEqual(["a", "water"]);
  });

  it("places rows straight into their sections on a different day", () => {
    const other = [state("a", 1), state("b", 0)];
    const split = nextSplit(initialSplit(DAY, before), DAY, other);
    const next = nextSplit(split, "2026-09-12", other);

    expect(next.held).toBeNull();
    expect(ids(sections(next, other).done)).toEqual(["a"]);
  });

  it("places a habit that was not on screen by its own state", () => {
    const grown = [...before, state("c", 1)];
    const split = nextSplit(initialSplit(DAY, before), DAY, grown);
    expect(ids(sections(split, grown).done)).toEqual(["c"]);
  });

  it("holds nothing when the store finishes loading", () => {
    const next = nextSplit(initialSplit(null, []), DAY, [state("a", 1)]);
    expect(next.held).toBeNull();
  });
});
