import type { Metadata } from "next";

const DESCRIPTION =
  "Your whole year as a contribution grid, with current and longest streaks and per-habit completion rates.";

export const metadata: Metadata = {
  title: "Stats",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Stats · OpenHabits",
    description: DESCRIPTION,
  },
};

/** See the note in `app/week/layout.tsx` — `page.tsx` is a client component. */
export default function StatsLayout({ children }: LayoutProps<"/stats">) {
  return children;
}
