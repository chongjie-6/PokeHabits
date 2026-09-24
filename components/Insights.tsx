"use client";

import {
  weekdayExtremes,
  type MonthRate,
  type WeekdayRate,
} from "@/lib/insights";

/**
 * The two second-order reads of the grid. See DESIGN.md §4.5. Bar rows rather
 * than charts: the grid above is already the densest thing on screen, so these
 * borrow its colours and stay flat. A null rate is a real answer, drawn as an
 * empty track — "never scheduled" must not look like "always missed".
 */

export function WeekdayRates({ rates }: { rates: WeekdayRate[] }) {
  const extremes = weekdayExtremes(rates);

  return (
    <div className="surface-card bg-surface p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        By day of the week
      </h2>

      <ul className="mt-3 space-y-1.5">
        {rates.map((day) => (
          <li key={day.weekday} className="flex items-center gap-3">
            <span className="w-8 shrink-0 text-[12px] text-muted">
              {day.label}
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
              {day.rate !== null && (
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(day.rate * 100)}%` }}
                />
              )}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">
              {day.rate === null ? "—" : `${Math.round(day.rate * 100)}%`}
            </span>
          </li>
        ))}
      </ul>

      {extremes && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          <strong className="font-medium text-foreground">
            {extremes.best.label}
          </strong>{" "}
          is your strongest day and{" "}
          <strong className="font-medium text-foreground">
            {extremes.worst.label}
          </strong>{" "}
          your weakest — {Math.round(extremes.best.rate! * 100)}% against{" "}
          {Math.round(extremes.worst.rate! * 100)}%.
        </p>
      )}
    </div>
  );
}

/**
 * Vertical, unlike its neighbour: seven weekdays read as a ranking, where a run
 * of months reads as a direction and has to be seen left to right.
 */
export function MonthlyTrend({ months }: { months: MonthRate[] }) {
  if (months.length < 2) return null;

  return (
    <div className="surface-card bg-surface p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Month by month
      </h2>

      <ol className="mt-3 flex items-end gap-1.5">
        {months.map((month) => (
          <li
            key={month.month}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <span className="font-mono text-[10px] tabular-nums text-muted">
              {month.rate === null ? "" : Math.round(month.rate * 100)}
            </span>
            <span
              // A fixed track, so a bad month is a short bar rather than a
              // missing one.
              className="flex h-20 w-full items-end rounded-xs bg-surface-2"
              aria-hidden="true"
            >
              <span
                className="block w-full rounded-xs bg-accent"
                style={{ height: `${Math.round((month.rate ?? 0) * 100)}%` }}
              />
            </span>
            <span className="truncate text-[10px] text-muted">
              {month.label}
            </span>
          </li>
        ))}
      </ol>

      <p className="sr-only">
        {months
          .map(
            (m) =>
              `${m.label}: ${m.rate === null ? "nothing scheduled" : `${Math.round(m.rate * 100)} percent`}`,
          )
          .join(". ")}
      </p>
    </div>
  );
}
