"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  activeTagsFor,
  corpusFor,
  countFor,
  deckCountFor,
  MODE_COPY,
  repeatGapFor,
  scheduleFor,
  tagsFor,
  type DailyItem,
} from "@/lib/daily";
import { daysBetween } from "@/lib/dates";
import { toggleFavourite, updateSettings, useOpenHabits } from "@/lib/store";
import { useToday } from "@/lib/use-today";
import type { DailyMode, DayKey } from "@/lib/types";

type Tab = "saved" | "all";

/**
 * The collection follows `dailyMode`: a shelf of quotes shown to someone whose
 * Today card is a fun fact would be a second app. The switch is repeated here
 * because this is where you decide, and one favourites list spans both.
 */
export default function CollectionPage() {
  const { hydrated, settings } = useOpenHabits();
  const today = useToday(settings.dayStartHour);
  const mode = settings.dailyMode;
  const copy = MODE_COPY[mode];

  const [tab, setTab] = useState<Tab>("saved");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const corpus = useMemo(() => corpusFor(mode), [mode]);

  const deckTags = settings.dailyTags;

  // Narrowed by the same tags the card uses, so an excluded item shows no date
  // rather than a day it will never land on.
  const schedule = useMemo(
    () =>
      today ? scheduleFor(today, mode, deckTags) : new Map<string, DayKey>(),
    [today, mode, deckTags],
  );

  const inDeck = activeTagsFor(mode, deckTags);
  const deckSize = deckCountFor(mode, deckTags);

  const favourites = settings.favourites;
  const saved = useMemo(() => new Set(favourites), [favourites]);
  // Favourites span both corpora, so the tab count has to be of this one.
  const savedHere = useMemo(
    () => corpus.filter((item) => saved.has(item.id)).length,
    [corpus, saved],
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return corpus
      .filter((item) => {
        if (tab === "saved" && !saved.has(item.id)) return false;
        if (tag && !item.tags.includes(tag)) return false;
        if (!needle) return true;
        return (
          item.text.toLowerCase().includes(needle) ||
          item.byline.toLowerCase().includes(needle) ||
          (item.detail?.toLowerCase().includes(needle) ?? false)
        );
      })
      .sort((a, b) => {
        // Soonest first, so the list reads as "what's coming".
        const dayA = schedule.get(a.id) ?? "9999";
        const dayB = schedule.get(b.id) ?? "9999";
        return dayA < dayB ? -1 : dayA > dayB ? 1 : 0;
      });
  }, [corpus, tab, query, tag, schedule, saved]);

  function switchMode(next: DailyMode) {
    if (next === mode) return;
    updateSettings({ dailyMode: next });
    // The tags belong to the corpus that just left the screen.
    setTag(null);
  }

  if (!hydrated || !today) return <Skeleton />;

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="display-type text-[15px]">Collection</h1>
        <Link
          href="/"
          className="shrink-0 text-[12px] text-muted hover:text-foreground"
        >
          Today&rsquo;s {copy.one} →
        </Link>
      </header>

      <div className="flex gap-2">
        <Segment
          active={mode === "quotes"}
          onClick={() => switchMode("quotes")}
        >
          Quotes
        </Segment>
        <Segment active={mode === "facts"} onClick={() => switchMode("facts")}>
          Fun facts
        </Segment>
      </div>

      <div className="flex gap-2">
        <Segment active={tab === "saved"} onClick={() => setTab("saved")}>
          Saved · {savedHere}
        </Segment>
        <Segment active={tab === "all"} onClick={() => setTab("all")}>
          All · {countFor(mode)}
        </Segment>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          mode === "facts"
            ? "Search text or source"
            : "Search text, author or source"
        }
        aria-label={`Search ${copy.many}`}
        className="h-11 w-full rounded-control border border-border bg-surface px-3 text-[14px] placeholder:text-muted"
      />

      <div className="flex flex-wrap gap-1.5">
        {tagsFor(mode).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={tag === option}
            onClick={() =>
              setTag((current) => (current === option ? null : option))
            }
            className={`h-8 rounded-full border px-3 text-[12px] capitalize transition-colors ${
              tag === option
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <p className="surface-dashed px-4 py-8 text-center text-[13px] leading-relaxed text-muted">
          {tab === "saved" && !query && !tag ? (
            <>
              Nothing saved yet. Tap the heart on a {copy.one} to keep it.
              <br />
              <button
                type="button"
                onClick={() => setTab("all")}
                className="mt-2 text-accent"
              >
                Browse all {countFor(mode)} instead
              </button>
            </>
          ) : (
            `No ${copy.many} match that.`
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((item) => (
            <li key={item.id}>
              <ItemRow
                item={item}
                saved={saved.has(item.id)}
                showing={schedule.get(item.id)}
                today={today}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="pb-2 text-[11px] leading-relaxed text-muted">
        {inDeck.length > 0 && (
          <>
            Your daily {copy.one} is drawn from the {deckSize} tagged{" "}
            <span className="text-foreground">{inDeck.join(", ")}</span>.
            Everything else is still here to browse and save.{" "}
          </>
        )}
        Every {copy.one} in the deck is shown once before any of them comes
        round again, and none can repeat within {repeatGapFor(mode, deckTags)}{" "}
        days. Which {copy.one} lands on which day is a pure function of the date
        — identical on every device you own, with or without a connection.
      </p>
    </section>
  );
}

function ItemRow({
  item,
  saved,
  showing,
  today,
}: {
  item: DailyItem;
  saved: boolean;
  showing: DayKey | undefined;
  today: DayKey;
}) {
  return (
    <article className="surface-card bg-surface p-4">
      <div className="flex items-start gap-3">
        <blockquote className="min-w-0 flex-1 font-serif text-[15px] leading-normal">
          {item.text}
        </blockquote>
        <button
          type="button"
          onClick={() => toggleFavourite(item.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.byline}` : `Save ${item.byline}`}
          className={`-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            saved ? "text-accent" : "text-muted hover:text-accent"
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0">
          <cite className="text-[11px] font-semibold not-italic uppercase tracking-[0.08em] text-muted">
            {item.byline}
          </cite>
          {item.detail && (
            <span className="block text-[11px] text-muted">{item.detail}</span>
          )}
        </p>
        {showing && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">
            {relativeDay(today, showing)}
          </span>
        )}
      </div>

      {item.note && (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
          {item.note}
        </p>
      )}
    </article>
  );
}

function relativeDay(today: DayKey, day: DayKey): string {
  const delta = daysBetween(today, day);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta < 7) return `in ${delta} days`;
  if (delta < 14) return "next week";
  return `in ${Math.round(delta / 7)} weeks`;
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 flex-1 rounded-control border text-[13px] font-medium transition-colors ${
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-28 rounded bg-surface-2" />
      <div className="h-10 rounded-control bg-surface-2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 rounded-card bg-surface-2" />
      ))}
    </div>
  );
}
