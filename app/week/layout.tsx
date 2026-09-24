import type { Metadata } from "next";

const DESCRIPTION =
  "Seven days across every habit. Tick today, and backfill or correct the days you missed.";

export const metadata: Metadata = {
  title: "Week",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Week · OpenHabits",
    description: DESCRIPTION,
  },
};

/**
 * Metadata is readable only from a Server Component, and `page.tsx` here is a
 * client one, so the route's metadata lives in this layout. It adds no markup.
 */
export default function WeekLayout({ children }: LayoutProps<"/week">) {
  return children;
}
