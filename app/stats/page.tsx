"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HabitRow } from "@/components/HabitRow";
import { Heatmap, HeatmapLegend } from "@/components/Heatmap";
import { MonthlyTrend, WeekdayRates } from "@/components/Insights";
import { ShareGrid } from "@/components/ShareGrid";
import { habitColor } from "@/lib/colors";
import { addDays, formatDayFull, startOfMonth, startOfWeek } from "@/lib/dates";
import { buildHistory, habitsForDay, perHabitTotals } from "@/lib/history";
import { monthRates, perHabitStreaks, weekdayRates } from "@/lib/insights";
import { useOpenHabits } from "@/lib/store";
import { computeStreaks } from "@/lib/streaks";
import { useMediaQuery, WIDE } from "@/lib/use-media-query";
import { useToday } from "@/lib/use-today";
import type { DayKey } from "@/lib/types";

const FULL_YEAR_WEEKS = 53;
const COMPACT_WEEKS = 20;
/** How far the trend looks back, independently of the grid's own window. */
const TREND_MONTHS = 6;

export default function StatsPage() {
  const { hydrated, habits, entries, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const wide = useMediaQuery(WIDE);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<DayKey | null>(null);

  // The transposed layout is tall, so the phone starts on a shorter window.
  const weeks = wide || expanded ? FULL_YEAR_WEEKS : COMPACT_WEEKS;

  const view = useMemo(() => {
    if (!hydrated || !today) return null;

    const day = today;
    const lastWeekStart = startOfWeek(day, settings.weekStartsOn);
    const from = addDays(lastWeekStart, -(weeks - 1) * 7);
    const to = addDays(lastWeekStart, 6);

    const stats = buildHistory(
      habits,
      entries,
      from,
      to,
      settings.weekStartsOn,
    );
    // Streaks and rates read the past, never the tail of future cells.
    const past = stats.filter((s) => s.date <= day);

    // Whole calendar months, which the grid's week-aligned window cannot give:
    // its first bar would be a fraction standing beside five whole ones.
    const trendFrom = startOfMonth(day, TREND_MONTHS - 1);
    const trend = monthRates(
      buildHistory(habits, entries, trendFrom, day, settings.weekStartsOn),
    );

    return {
      day,
      stats,
      past,
      streaks: computeStreaks(past),
      totals: perHabitTotals(habits, entries, from, day, settings.weekStartsOn),
      habitStreaks: perHabitStreaks(
        habits,
        entries,
        from,
        day,
        settings.weekStartsOn,
      ),
      weekdays: weekdayRates(past, settings.weekStartsOn),
      trend,
      windowDays: past.length,
      from,
    };
  }, [hydrated, today, habits, entries, settings, weeks]);

  if (!view) return <Skeleton />;

  const {
    day,
    stats,
    past,
    streaks,
    totals,
    habitStreaks,
    weekdays,
    trend,
    windowDays,
    from,
  } = view;
  const selectedStates = selected
    ? habitsForDay(habits, entries, selected, settings.weekStartsOn)
    : null;

  return (
    <section className="space-y-6">
      <h1 className="display-type text-[15px]">Your year</h1>

      {habits.length === 0 ? (
        <p className="surface-dashed px-4 py-8 text-center text-[13px] text-muted">
          Add a habit and this grid starts filling in.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Current streak" value={streaks.current} unit="days" />
            <Stat label="Longest" value={streaks.longest} unit="days" />
            <Stat
              label="Perfect days"
              value={streaks.perfectDays}
              unit="total"
            />
          </div>

          {/* The same information in prose — a 371-cell grid is a poor primary
              read for a screen reader regardless of how well it is labelled. */}
          <p className="text-[13px] leading-relaxed text-muted">
            Over the last {windowDays} days you completed{" "}
            <strong className="font-medium text-foreground">
              {Math.round(streaks.completionRate * 100)}%
            </strong>{" "}
            of your scheduled habits, with {streaks.perfectDays} complete{" "}
            {streaks.perfectDays === 1 ? "day" : "days"}
            {streaks.longest > 0 && (
              <> and a longest run of {streaks.longest}</>
            )}
            .
          </p>

          <div className="surface-card bg-surface p-4">
            <Heatmap
              stats={stats}
              weekStartsOn={settings.weekStartsOn}
              today={day}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              {!wide ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-[12px] font-medium text-accent"
                >
                  {expanded ? "Show less" : "Show full year"}
                </button>
              ) : (
                <span />
              )}
              <HeatmapLegend />
            </div>
            <div className="mt-3 flex items-center justify-end gap-3 border-t border-border pt-3">
              <ShareGrid
                // A thunk, so the year is not drawn to a canvas until the tap.
                card={() => ({
                  title: "My year in habits",
                  subtitle: `${formatDayFull(from)} — ${formatDayFull(day)}`,
                  figures: [
                    { value: String(streaks.current), label: "day streak" },
                    {
                      value: `${Math.round(streaks.completionRate * 100)}%`,
                      label: "completed",
                    },
                    {
                      value: String(streaks.perfectDays),
                      label: "perfect days",
                    },
                  ],
                  // The past only: a still image cannot dim what has not
                  // happened, so a Monday share would read as four missed days.
                  stats: past,
                })}
                filename={`openhabits-${day}.png`}
              />
            </div>
          </div>

          <WeekdayRates rates={weekdays} />
          <MonthlyTrend months={trend} />

          {selected && selectedStates && (
            <div className="surface-card bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[13px] font-semibold">
                  {formatDayFull(selected)}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-[12px] text-muted hover:text-foreground"
                >
                  Close
                </button>
              </div>
              {selectedStates.length === 0 ? (
                <p className="mt-2 text-[13px] text-muted">
                  No habits existed yet.
                </p>
              ) : (
                <ul className="mt-1 -mx-3">
                  {selectedStates.map((state) => (
                    <li key={state.habit.id}>
                      <HabitRow
                        state={state}
                        day={selected}
                        dimmed={!state.scheduled}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Tap a habit to correct the record for this day.
              </p>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              By habit
            </h2>
            <ul className="divide-y divide-border surface-card bg-surface">
              {habits.map((habit) => {
                const total = totals.get(habit.id) ?? {
                  scheduled: 0,
                  completed: 0,
                };
                const rate =
                  total.scheduled === 0 ? 0 : total.completed / total.scheduled;
                const streak = habitStreaks.get(habit.id)?.current ?? 0;
                return (
                  <li key={habit.id}>
                    <Link
                      href={`/habit?id=${habit.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span aria-hidden="true" className="w-6 text-center">
                        {habit.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 truncate text-[14px]">
                            {habit.name}
                          </span>
                          {streak > 0 && (
                            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
                              {streak}d
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-2">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.round(rate * 100)}%`,
                              background: habitColor(habit.color),
                            }}
                          />
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-mono text-[12px] tabular-nums text-muted">
                        {Math.round(rate * 100)}%
                        <span className="block text-[10px] opacity-70">
                          {total.completed}/{total.scheduled}
                        </span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-muted">
                        ›
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="surface-card bg-surface px-3 py-3 text-center">
      <p className="font-mono text-[22px] font-semibold tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="text-[10px] text-muted">{unit}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="h-20 rounded-card bg-surface-2" />
      <div className="h-48 rounded-card bg-surface-2" />
    </div>
  );
}
