/**
 * Writes the demo backup.json that scripts/screenshots/shoot.mjs imports through
 * the app's own Settings → Import, so the screenshots show the real store.
 *
 * Days are modelled as good or slipping rather than each habit rolled
 * independently: a perfect day means every scheduled habit hit its target, and
 * independent rolls almost never produce one, which is what made the first pass
 * read "longest streak: 1".
 */
import { writeFileSync } from "node:fs";

const DAY = 86400000;
const now = new Date();
const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = key(now);

let s = 424242;
const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

const HABITS = [
  {
    id: "h-move",
    name: "Move",
    emoji: "🏃",
    color: "green",
    target: 1,
    cadence: { kind: "daily" },
  },
  {
    id: "h-read",
    name: "Read",
    emoji: "📖",
    color: "blue",
    target: 1,
    cadence: { kind: "daily" },
  },
  {
    id: "h-meditate",
    name: "Meditate",
    emoji: "🧘",
    color: "violet",
    target: 1,
    cadence: { kind: "daily" },
  },
  {
    id: "h-water",
    name: "Water",
    emoji: "💧",
    color: "teal",
    target: 8,
    cadence: { kind: "daily" },
  },
  {
    id: "h-journal",
    name: "Journal",
    emoji: "✍️",
    color: "rose",
    target: 1,
    cadence: { kind: "daily" },
  },
  {
    id: "h-stretch",
    name: "Stretch",
    emoji: "🤸",
    color: "amber",
    target: 1,
    cadence: { kind: "weekdays", days: [1, 3, 5] },
  },
];

const start = new Date(now.getTime() - 364 * DAY);
const habits = HABITS.map((h, i) => ({
  id: h.id,
  name: h.name,
  emoji: h.emoji,
  color: h.color,
  cadence: h.cadence,
  target: h.target,
  order: i,
  createdAt: key(start),
  archivedAt: null,
  updatedAt: start.getTime(),
  deletedAt: null,
}));

/** quality[i] for i days ago: 1 = every scheduled habit hit, 0 = nothing. */
const quality = new Array(365).fill(0);
for (let i = 364; i >= 0; i--) {
  const recency = 1 - i / 364;
  const dow = new Date(now.getTime() - i * DAY).getDay();
  const weekend = dow === 0 || dow === 6 ? 0.45 : 1;
  const p = (0.32 + recency * 0.36) * weekend; // better through the year, worse at weekends
  quality[i] = rnd() < p ? 1 : (0.25 + rnd() * 0.5) * (weekend === 1 ? 1 : 0.7);
}
// Two weeks away, in the spring.
for (let i = 98; i < 111; i++) quality[i] = 0;
// The longest run: 32 perfect days after coming back.
for (let i = 58; i < 90; i++) quality[i] = 1;
// The current run: nineteen days, ending yesterday.
for (let i = 1; i <= 19; i++) quality[i] = 1;
// Today is still in flight — deliberately mid-progress.
quality[0] = -1;

const entries = [];
for (let i = 364; i >= 0; i--) {
  const d = new Date(now.getTime() - i * DAY);
  const date = key(d);
  const dow = d.getDay();
  const scheduled = HABITS.filter(
    (h) => h.cadence.kind === "daily" || h.cadence.days.includes(dow),
  );

  if (quality[i] === -1) {
    entries.push({ habitId: "h-move", date, count: 1, updatedAt: Date.now() });
    entries.push({ habitId: "h-read", date, count: 1, updatedAt: Date.now() });
    entries.push({ habitId: "h-water", date, count: 6, updatedAt: Date.now() });
    continue;
  }

  for (const h of scheduled) {
    if (quality[i] === 1) {
      entries.push({
        habitId: h.id,
        date,
        count: h.target,
        updatedAt: d.getTime(),
      });
      continue;
    }
    if (rnd() > quality[i]) continue;
    const count =
      h.target > 1
        ? Math.max(2, Math.round(h.target * (0.4 + rnd() * 0.5)))
        : 1;
    entries.push({ habitId: h.id, date, count, updatedAt: d.getTime() });
  }
}

writeFileSync(
  new URL("./backup.json", import.meta.url),
  JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      habits,
      entries,
      settings: {
        weekStartsOn: 1,
        dayStartHour: 0,
        reminderHour: 9,
        haptics: true,
        dailyMode: "quotes",
        favourites: [
          "dillard-days",
          "seneca-begin-at-once",
          "lee-one-kick",
          "thoreau-deliberately",
          "close-inspiration-amateurs",
          "laozi-thousand-miles",
        ],
        dailyTags: [],
      },
    },
    null,
    2,
  ),
);

const perfect = quality.filter((q) => q === 1).length;
console.log(
  `${habits.length} habits, ${entries.length} entries, ~${perfect} perfect days, today = ${today}`,
);
