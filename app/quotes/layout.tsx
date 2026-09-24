import type { Metadata } from "next";

const DESCRIPTION =
  "Every quote and fun fact in OpenHabits, and the ones you have saved — searchable by author, source and tag.";

export const metadata: Metadata = {
  title: "Collection",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "Collection · OpenHabits",
    description: DESCRIPTION,
  },
};

/**
 * See `app/week/layout.tsx` — `page.tsx` is a client component. The route stays
 * `/quotes` now it shows facts too: bookmarks and caches are not worth churning.
 */
export default function QuotesLayout({ children }: LayoutProps<"/quotes">) {
  return children;
}
