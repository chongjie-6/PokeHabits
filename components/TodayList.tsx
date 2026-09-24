"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AddHabit } from "@/components/AddHabit";
import { useBrowseDay } from "@/components/BrowseDay";
import { HabitFormPanel } from "@/components/HabitFormPanel";
import { HabitRow, HabitRowDense, HabitTile } from "@/components/HabitRow";
import { levelColor } from "@/lib/colors";
import {
  addDays,
  formatDayLong,
  formatDayFull,
  formatWeekdayLong,
  relativeDayLabel,
} from "@/lib/dates";
import {
  buildHabitHistory,
  buildHistory,
  habitsForDay,
  type DayStat,
  type HabitDayState,
} from "@/lib/history";
import { useSkin, type Skin } from "@/lib/skin";
import { updateHabit, useOpenHabits } from "@/lib/store";
import { computeStreaks } from "@/lib/streaks";
import { useTodaySplit } from "@/lib/today-split";
import { MOBILE, useMediaQuery } from "@/lib/use-media-query";
import { useSwipe } from "@/lib/use-swipe";
import { useToday } from "@/lib/use-today";
import type { DayKey } from "@/lib/types";

/** How far back to scan for streaks. Beyond this, a streak is its own reward. */
const STREAK_WINDOW = 365;

/**
 * Shorter than the aggregate window, which is one pass where this is one per
 * habit. 90 days is more than the badge can show; the habit's own screen is
 * where a longer streak reads correctly.
 */
const HABIT_STREAK_WINDOW = 90;

/** Days in the strip under a dense row. */
const TRAIL_DAYS = 14;

/** Weeks in the Today heat strip. A full year does not fit a phone unrotated. */
const STRIP_WEEKS = 26;

type PerHabit = { trail: DayStat[]; streak: number };

/** Present only in edit mode (§6.10). */
type Edit = {
  open: (habitId: string) => void;
  /** The habit whose inline form stands in for its row, on a pointer device. */
  inlineId: string | null;
  form: React.ReactNode;
};

export function TodayList() {
  const { hydrated, habits, entries, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const skin = useSkin();
  const sheet = useMediaQuery(MOBILE);
  const { offset, setOffset } = useBrowseDay();
  const [editMode, setEditMode] = useState(false);
  // Kept after the editor closes, so the sheet animating out still has its habit.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // See AddHabit: bumped on open only.
  const [instance, setInstance] = useState(0);
  const swipe = useSwipe((direction) => {
    setOffset((o) => o + (direction === "left" ? 1 : -1));
    setEditorOpen(false);
  });

  const day = today === null ? null : addDays(today, offset);

  /**
   * Anchored on `today`, never on the browsed day: these are claims about the
   * present, and a day in the future would score everything between as missed.
   * Its own memo is also what makes a swipe cheap — a year against one pass.
   */
  const summary = useMemo(() => {
    if (!hydrated || !today) return null;

    const history = buildHistory(
      habits,
      entries,
      addDays(today, -(STREAK_WINDOW - 1)),
      today,
      settings.weekStartsOn,
    );

    // Only the skins that show per-habit history pay for computing it.
    const perHabit = new Map<string, PerHabit>();
    if (skin !== "classic") {
      for (const habit of habits) {
        const own = buildHabitHistory(
          habit,
          entries,
          addDays(today, -(HABIT_STREAK_WINDOW - 1)),
          today,
          settings.weekStartsOn,
        );
        perHabit.set(habit.id, {
          trail: own.slice(-TRAIL_DAYS),
          streak: computeStreaks(own).current,
        });
      }
    }

    return {
      streaks: computeStreaks(history),
      recent: history.slice(-7),
      strip: history.slice(-(STRIP_WEEKS * 7)),
      perHabit,
    };
  }, [hydrated, today, habits, entries, settings, skin]);

  const states = useMemo(() => {
    if (!hydrated || !day) return null;
    return habitsForDay(habits, entries, day, settings.weekStartsOn);
  }, [hydrated, day, habits, entries, settings.weekStartsOn]);

  const scheduled = useMemo(
    () => states?.filter((s) => s.scheduled) ?? null,
    [states],
  );
  const { todo, done: finished } = useTodaySplit(day, scheduled);
  const sectionRef = useRef<HTMLElement>(null);
  const onFocus = useFocusFollowsHabit(sectionRef);

  // Gated on hydration (§7.1): a checked box rendering unchecked for 200ms
  // reads as data loss. It is also what makes `useSkin` safe here.
  if (!summary || !states || !scheduled || !day || !today) return <Skeleton />;

  const { streaks, recent, strip, perHabit } = summary;
  const unscheduled = states.filter((s) => !s.scheduled);
  const done = scheduled.filter((s) => s.done).length;
  const future = day > today;

  const editingHabit = habits.find((h) => h.id === editingId);
  const form = editingHabit && (
    <HabitFormPanel
      sheet={sheet}
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      title="Edit habit"
      instance={instance}
      initial={editingHabit}
      submitLabel="Save changes"
      onSubmit={(values) => {
        updateHabit(editingHabit.id, values);
        setEditorOpen(false);
      }}
    />
  );
  const edit: Edit | null =
    editMode && habits.length > 0
      ? {
          open: (habitId) => {
            setEditingId(habitId);
            setInstance((n) => n + 1);
            setEditorOpen(true);
          },
          inlineId: !sheet && editorOpen ? editingId : null,
          form,
        }
      : null;

  return (
    <section className="mt-6" {...swipe} ref={sectionRef} onFocus={onFocus}>
      <Header
        skin={skin}
        day={day}
        today={today}
        done={done}
        total={scheduled.length}
      />

      {/* With no habits there is nothing to edit. */}
      {habits.length > 0 && (
        <EditToggle
          editMode={editMode}
          onEditMode={(next) => {
            setEditMode(next);
            setEditorOpen(false);
          }}
        />
      )}

      {edit && (
        <p className="mt-1 text-[12px] text-muted">
          Tap a habit to edit it. Ticking is off until you press Done.
        </p>
      )}

      {skin === "grid" && habits.length > 0 && (
        <HeatStrip stats={strip} rate={streaks.completionRate} />
      )}

      {habits.length === 0 ? (
        <EmptyState />
      ) : skin === "blocks" ? (
        <Tiles
          todo={todo}
          finished={finished}
          unscheduled={unscheduled}
          day={day}
          readOnly={future}
          perHabit={perHabit}
          edit={edit}
        />
      ) : (
        <Rows
          skin={skin}
          todo={todo}
          finished={finished}
          unscheduled={unscheduled}
          day={day}
          readOnly={future}
          perHabit={perHabit}
          edit={edit}
        />
      )}

      {sheet && form}

      {/* A habit created today is not active on the day being browsed, so it
          would be added into an empty screen. The button comes back with the
          day it belongs to. */}
      {offset === 0 && <AddHabit />}

      {habits.length > 0 && skin !== "grid" && (
        <StreakLink skin={skin} recent={recent} streak={streaks.current} />
      )}
    </section>
  );
}

/**
 * Moving a row between To do and Done remounts its button, dropping focus to
 * `<body>` (§6.9) — so focus goes back to the same habit, but only when the
 * button is gone, since a click on blank space lands on `<body>` too. The
 * inline editor's wrapper carries the habit id for the same reason.
 */
function useFocusFollowsHabit(container: React.RefObject<HTMLElement | null>) {
  const last = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const was = last.current;
    if (!was || was.isConnected) return;
    last.current = null;
    if (document.activeElement !== document.body || !was.dataset.habitId)
      return;
    container.current
      ?.querySelector<HTMLElement>(
        `[data-habit-id="${CSS.escape(was.dataset.habitId)}"]`,
      )
      ?.focus({ preventScroll: true });
  });

  return (event: React.FocusEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-habit-id]",
    );
    if (target) last.current = target;
  };
}

/** Kept apart from the week strip, whose buttons are pressed in quick succession. */
function EditToggle({
  editMode,
  onEditMode,
}: {
  editMode: boolean;
  onEditMode: (next: boolean) => void;
}) {
  return (
    <div className="mt-2 flex items-center">
      <button
        type="button"
        onClick={() => onEditMode(!editMode)}
        className={`h-9 rounded-control border px-3 text-[13px] font-medium transition-colors ${
          editMode
            ? "border-accent bg-accent text-accent-fg"
            : "border-border text-foreground hover:bg-surface-2"
        }`}
      >
        {editMode ? "Done" : "Edit"}
      </button>
    </div>
  );
}

function Header({
  skin,
  day,
  today,
  done,
  total,
}: {
  skin: Skin;
  day: DayKey;
  today: DayKey;
  done: number;
  total: number;
}) {
  const relative = relativeDayLabel(day, today);

  if (skin === "blocks") {
    return (
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display-type truncate text-[32px] leading-[0.92]">
            {relative ?? formatWeekdayLong(day)}
          </h1>
          <p className="mt-1 text-[12px] font-medium tracking-[0.12em] uppercase">
            {formatDayFull(day)}
          </p>
        </div>
        {total > 0 && (
          <p className="display-type shrink-0 bg-accent px-3 py-2 text-[17px] tabular-nums text-accent-fg">
            {done} / {total}
          </p>
        )}
      </header>
    );
  }

  if (skin === "grid") {
    return (
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium tracking-widest uppercase text-muted">
            {formatDayFull(day)}
          </p>
          <h1 className="display-type mt-0.5 truncate text-[20px]">
            {relative ?? formatWeekdayLong(day)}
          </h1>
        </div>
        {total > 0 && (
          <p className="flex shrink-0 items-baseline gap-0.5">
            <span className="font-mono text-[28px] font-semibold leading-none tabular-nums">
              {done}
            </span>
            <span className="font-mono text-[15px] text-muted">/{total}</span>
          </p>
        )}
      </header>
    );
  }

  return (
    <header className="flex items-baseline justify-between gap-3">
      {/* Today keeps its date rather than saying so twice: the week strip
          already marks which circle is today. */}
      <h1 className="display-type min-w-0 truncate text-[15px]">
        {day === today ? formatDayLong(day) : (relative ?? formatDayLong(day))}
      </h1>
      {total > 0 && (
        <p className="shrink-0 font-mono text-[12px] tabular-nums text-muted">
          {done} of {total} done
        </p>
      )}
    </header>
  );
}

/**
 * `grid` promotes the contribution grid onto Today — not the `Heatmap`
 * component, which is the interactive year and goes tall on a phone. This one
 * is a short read-only summary, and tapping it opens the real thing.
 */
function HeatStrip({ stats, rate }: { stats: DayStat[]; rate: number }) {
  const scored = stats.filter((s) => s.level !== "rest").length;

  return (
    <Link
      href="/stats"
      className="surface-card mt-4 block bg-surface p-3 transition-colors hover:bg-surface-2"
    >
      <span
        aria-hidden="true"
        className="grid grid-flow-col grid-rows-7 justify-start gap-0.5"
      >
        {stats.map((stat) => (
          <span
            key={stat.date}
            className="h-2.25 w-2.25 rounded-cell"
            style={{
              background:
                stat.level === "rest"
                  ? "var(--surface-2)"
                  : levelColor(stat.level),
            }}
          />
        ))}
      </span>

      <span className="mt-2.5 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tabular-nums text-muted">
          {scored} days ·{" "}
          <span className="font-semibold text-foreground">
            {Math.round(rate * 100)}%
          </span>
        </span>
        <span aria-hidden="true" className="flex items-center gap-0.75">
          <span className="mr-1 font-mono text-[10px] tracking-widest uppercase text-muted">
            Less
          </span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span
              key={level}
              className="h-2.25ww-2.25rounded-cell"
              style={{ background: levelColor(level) }}
            />
          ))}
          <span className="ml-1 font-mono text-[10px] tracking-widest uppercase text-muted">
            More
          </span>
        </span>
      </span>
    </Link>
  );
}

function Rows({
  skin,
  todo,
  finished,
  unscheduled,
  day,
  readOnly,
  perHabit,
  edit,
}: {
  skin: Skin;
  todo: HabitDayState[];
  finished: HabitDayState[];
  unscheduled: HabitDayState[];
  day: DayKey;
  readOnly: boolean;
  perHabit: Map<string, PerHabit>;
  edit: Edit | null;
}) {
  const render = (state: HabitDayState, dimmed?: boolean) => {
    const id = state.habit.id;
    if (edit?.inlineId === id) {
      return (
        <div data-habit-id={id} className="px-3 py-2">
          {edit.form}
        </div>
      );
    }
    const onEdit = edit ? () => edit.open(id) : undefined;
    if (skin === "grid") {
      const own = perHabit.get(id);
      return (
        <HabitRowDense
          state={state}
          day={day}
          trail={own?.trail}
          streak={own?.streak}
          readOnly={readOnly}
          dimmed={dimmed}
          onEdit={onEdit}
        />
      );
    }
    return (
      <HabitRow
        state={state}
        day={day}
        readOnly={readOnly}
        dimmed={dimmed}
        onEdit={onEdit}
      />
    );
  };

  const item = (state: HabitDayState) => (
    <li key={state.habit.id}>{render(state)}</li>
  );

  return (
    <>
      {todo.length + finished.length > 0 && (
        <h2 className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
          To do ({todo.length})
        </h2>
      )}
      {todo.length > 0 ? (
        <ul className="-mx-3 mt-1">{todo.map(item)}</ul>
      ) : (
        finished.length > 0 && <AllDone />
      )}

      {finished.length > 0 && (
        <details open className="-mx-3 mt-4">
          <summary className="cursor-pointer px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Done ({finished.length})
          </summary>
          <ul className="mt-1">{finished.map(item)}</ul>
        </details>
      )}

      {unscheduled.length > 0 && (
        <details className="-mx-3 mt-4">
          <summary className="cursor-pointer px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Not scheduled ({unscheduled.length})
          </summary>
          <ul className="mt-1">
            {unscheduled.map((state) => (
              <li key={state.habit.id}>{render(state, true)}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Tiles({
  todo,
  finished,
  unscheduled,
  day,
  readOnly,
  perHabit,
  edit,
}: {
  todo: HabitDayState[];
  finished: HabitDayState[];
  unscheduled: HabitDayState[];
  day: DayKey;
  readOnly: boolean;
  perHabit: Map<string, PerHabit>;
  edit: Edit | null;
}) {
  const tile = (state: HabitDayState, dimmed?: boolean) => {
    const id = state.habit.id;
    // A half-width cell is too narrow for the form, so it takes the whole row.
    if (edit?.inlineId === id) {
      return (
        <li key={id} className="col-span-2">
          <div data-habit-id={id}>{edit.form}</div>
        </li>
      );
    }
    return (
      <li key={id} className="flex">
        <HabitTile
          state={state}
          day={day}
          streak={perHabit.get(id)?.streak}
          readOnly={readOnly}
          dimmed={dimmed}
          onEdit={edit ? () => edit.open(id) : undefined}
        />
      </li>
    );
  };

  return (
    <>
      {todo.length + finished.length > 0 && (
        <h2 className="mt-4 text-[11px] font-bold uppercase tracking-widest">
          To do ({todo.length})
        </h2>
      )}
      {todo.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {todo.map((state) => tile(state))}
        </ul>
      ) : (
        finished.length > 0 && <AllDone />
      )}

      {finished.length > 0 && (
        <details open className="mt-5">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-muted">
            Done ({finished.length})
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {finished.map((state) => tile(state))}
          </ul>
        </details>
      )}

      {unscheduled.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-muted">
            Not scheduled ({unscheduled.length})
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {unscheduled.map((state) => tile(state, true))}
          </ul>
        </details>
      )}
    </>
  );
}

function StreakLink({
  skin,
  recent,
  streak,
}: {
  skin: Skin;
  recent: DayStat[];
  streak: number;
}) {
  if (skin === "blocks") {
    return (
      <Link
        href="/stats"
        className="surface-card mt-5 flex items-center justify-between gap-3 bg-accent px-4 py-3 text-accent-fg"
      >
        <span>
          <span className="display-type block text-[28px] leading-none">
            {streak > 0 ? streak : "—"}
          </span>
          <span className="mt-1 block text-[11px] font-bold tracking-[0.12em] uppercase">
            {streak > 0 ? "Day streak" : "Start today"}
          </span>
        </span>
        <span aria-hidden="true" className="flex gap-1">
          {recent.map((stat) => (
            <span
              key={stat.date}
              className="h-3.75 w-3.75"
              style={{
                background:
                  stat.level === "rest"
                    ? "transparent"
                    : levelColor(stat.level),
                boxShadow:
                  stat.level === "rest"
                    ? "inset 0 0 0 2px currentColor"
                    : "none",
              }}
            />
          ))}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/stats"
      className="surface-card mt-6 flex items-center justify-between bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {recent.map((stat) => (
          <span
            key={stat.date}
            className="h-4 w-4 rounded-[3px] border"
            style={{
              background: levelColor(stat.level),
              borderColor:
                stat.level === "rest" ? "var(--border)" : "transparent",
            }}
          />
        ))}
      </span>
      <span className="text-[13px] text-muted">
        {streak > 0 ? (
          <>
            <strong className="font-mono tabular-nums text-foreground">
              {streak}
            </strong>{" "}
            day streak 🔥
          </>
        ) : (
          "Start a streak today"
        )}
      </span>
    </Link>
  );
}

function AllDone() {
  return (
    <p className="mt-2 surface-dashed px-4 py-4 text-center text-[13px] text-muted">
      Everything&rsquo;s ticked.
    </p>
  );
}

function EmptyState() {
  return (
    <div className="mt-3 surface-dashed px-4 py-8 text-center">
      <p className="text-[15px] font-medium">Nothing to track yet</p>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted">
        Add one habit you could do today.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <section className="mt-6" aria-hidden="true">
      <div className="h-4 w-40 rounded bg-surface-2" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-control bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
