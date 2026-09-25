/**
 * Core domain types. See DESIGN.md §3. Dates are local civil `YYYY-MM-DD`:
 * never a UTC timestamp for day membership, or a 23:00 tick in UTC+11 lands
 * on a day the user did not experience.
 */

/** 'YYYY-MM-DD' in the user's local timezone. */
export type DayKey = string;

export type HabitColorKey =
  | "green"
  | "blue"
  | "violet"
  | "amber"
  | "rose"
  | "teal";

export const HABIT_COLORS: HabitColorKey[] = [
  "green",
  "blue",
  "violet",
  "amber",
  "rose",
  "teal",
];

/** A user-picked colour, lowercase `#rrggbb`. */
export type HexColor = `#${string}`;

/**
 * Keys stay keys rather than flattening to hex on save: each resolves to a
 * different value per theme, and a stored hex can only be one of the two.
 */
export type HabitColor = HabitColorKey | HexColor;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Palette keys pass through; a hex is lowercased so the sync fingerprint is stable. */
export function normaliseHabitColor(value: string): HabitColor | null {
  if (HABIT_COLORS.includes(value as HabitColorKey))
    return value as HabitColorKey;
  return isHexColor(value) ? (value.toLowerCase() as HexColor) : null;
}

export type Cadence =
  /** Every day. */
  | { kind: "daily" }
  /** Specific weekdays. 0 = Sunday … 6 = Saturday. */
  | { kind: "weekdays"; days: number[] }
  /** n times per week, on any days the user likes. */
  | { kind: "weekly"; times: number };

/**
 * Sync metadata. See DESIGN.md §13. The unit split is deliberate: civil dates
 * answer domain questions and must not shift under a timezone, where epoch ms
 * keeps a day's worth of edits from all tying.
 */
export type Synced = {
  /** Epoch ms of the last local edit. Last-write-wins merge key. */
  updatedAt: number;
  /**
   * Epoch ms of deletion, null if live. A tombstone rather than a removal: a
   * missing row is indistinguishable from one the peer has not seen yet.
   */
  deletedAt: number | null;
};

export type Habit = Synced & {
  id: string;
  name: string;
  emoji: string;
  color: HabitColor;
  cadence: Cadence;
  /** 1 for a simple tick; >1 for counted habits ("Water × 8"). */
  target: number;
  /** Manual sort position, ascending. */
  order: number;
  createdAt: DayKey;
  archivedAt: DayKey | null;
};

/**
 * A habit's state on one day. No tombstone by decision: "not done" is
 * `count: 0`, which LWW merges like any other value, and a habit deletion
 * already tells peers to drop the entries.
 */
export type Entry = {
  habitId: string;
  date: DayKey;
  /** 0 … target, and beyond — overachieving is allowed. */
  count: number;
  /** Epoch ms. Last-write-wins merge key, used by import and by sync. */
  updatedAt: number;
};

export type QuoteTag =
  | "discipline"
  | "resilience"
  | "craft"
  | "time"
  | "beginning"
  | "doubt"
  | "simplicity"
  | "courage"
  | "growth";

export type Quote = {
  id: string;
  text: string;
  author: string;
  /** Where it actually comes from. Required for anything we can trace. */
  source?: string;
  /** Set when the popular attribution is wrong and we are correcting it. */
  note?: string;
  tags: QuoteTag[];
};

export type FactTag =
  | "space"
  | "earth"
  | "ocean"
  | "animals"
  | "body"
  | "language"
  | "history"
  | "numbers"
  | "technology"
  | "food";

/**
 * The sibling of `Quote`, not a variant: a fact has no author, so `source` —
 * where it can be checked — is the whole of its provenance and is required.
 */
export type Fact = {
  id: string;
  text: string;
  source: string;
  /** Set when the popular version of the fact is wrong and we are correcting it. */
  note?: string;
  tags: FactTag[];
};

/**
 * A collectable found by finishing a good week (§5.5). `sprite` rows are pixel
 * art: `.` is empty, every other character is a key of `colors`.
 */
export type Creature = {
  id: string;
  name: string;
  blurb: string;
  colors: Record<string, string>;
  sprite: string[];
  /**
   * Idle animation (§5.5): `parts` lift boxes out of the sprite to move on their
   * own, `fx` adds pixels shown only mid-loop. The `idle.css` beside the sprite
   * animates both by name.
   */
  rig?: { parts?: Record<string, PixelBox>; fx?: Record<string, Pixel[]> };
};

/** `[x, y, width, height]` in sprite pixels. */
export type PixelBox = [x: number, y: number, w: number, h: number];

/** `[x, y, colour key]`; may sit just outside the sprite's grid. */
export type Pixel = [x: number, y: number, key: string];

/** Which corpus the daily card draws from. See DESIGN.md §5.3. */
export type DailyMode = "quotes" | "facts";

/**
 * The synced half of a user's preferences. Appearance is **not** in here:
 * `theme`, `skin` and `palette` are device-local, because a look chosen on a
 * phone has no business repainting a laptop. See DESIGN.md §13.8 #1.
 */
export type Settings = {
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
  /** 0–6. `4` means "the day rolls over at 4am" for night owls. */
  dayStartHour: number;
  /**
   * Wall-clock hour, 0–23, for the daily reminder — *when*, never *whether*,
   * which is per device and lives on the server (§8.5). Synced so a phone and
   * a laptop cannot disagree about when morning is.
   */
  reminderHour: number;
  /**
   * A second reminder, for whatever is still outstanding at the end of the
   * day. `null` is off, and is nullable rather than absent so that a blob from
   * a build without the field and a user who turned it off read the same.
   */
  eveningReminderHour: number | null;
  /**
   * Buzz on a tick. Inert rather than hidden without a motor, or the toggle
   * vanishes from the desktop where the phone is most likely configured.
   */
  haptics: boolean;
  /**
   * Quote or fun fact. Synced, unlike the appearance axes: it decides what the
   * app says to you, not how it looks.
   */
  dailyMode: DailyMode;
  /** One list across both corpora: a saved thing should survive a mode change. */
  favourites: string[];
  /**
   * Tags the daily card may draw from; empty is the whole corpus. One flat list
   * across both, whose unions are disjoint, and filtering to nothing falls back
   * to the whole corpus. `string[]` so an older build cannot reject a new tag —
   * and with it every habit in the same push.
   */
  dailyTags: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  weekStartsOn: 1,
  dayStartHour: 0,
  reminderHour: 9,
  eveningReminderHour: null,
  haptics: true,
  dailyMode: "quotes",
  favourites: [],
  dailyTags: [],
};

/**
 * One last-write-wins blob rather than per field: a conflict costs one person a
 * toggle they can flip back, and every field left here decides behaviour, which
 * should be the same everywhere. Appearance was the exception, and it left.
 */
export type SyncedSettings = {
  value: Settings;
  /** Epoch ms of the last settings change. */
  updatedAt: number;
};

/** Compound primary key for an entry. */
export function entryKey(habitId: string, date: DayKey): string {
  return `${habitId}:${date}`;
}

/**
 * Backup file format. v1 predates sync metadata, which `normaliseHabit` fills
 * in; the bump keeps a v2 file out of a build that would drop the new fields.
 */
export type ExportBundle = {
  version: 2;
  exportedAt: string;
  habits: Habit[];
  entries: Entry[];
  settings: Settings;
};

/** A v1 habit: everything except the sync metadata. */
type LegacyHabit = Omit<Habit, keyof Synced> & Partial<Synced>;

export type AnyExportBundle =
  | ExportBundle
  | {
      version: 1;
      exportedAt: string;
      habits: LegacyHabit[];
      entries: Entry[];
      settings: Settings;
    };

/**
 * Fill in metadata a v1 backup could not carry. `updatedAt` falls back to the
 * creation day, not now, so stale habits cannot outrank server edits.
 */
export function normaliseHabit(habit: LegacyHabit): Habit {
  if (habit.updatedAt !== undefined) {
    return {
      ...habit,
      updatedAt: habit.updatedAt,
      deletedAt: habit.deletedAt ?? null,
    };
  }

  // An unparseable createdAt falls back to 0, the stamp that loses every merge.
  const created = Date.parse(`${habit.createdAt}T00:00:00Z`);
  return {
    ...habit,
    updatedAt: Number.isNaN(created) ? 0 : created,
    deletedAt: habit.deletedAt ?? null,
  };
}
