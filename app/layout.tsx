import type { Metadata, Viewport } from "next";
import {
  Archivo_Black,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Space_Grotesk,
} from "next/font/google";
import { BottomNav, Hydrator } from "@/components/AppChrome";
import { UndoBar } from "@/components/UndoBar";
import { siteURL } from "@/lib/site-url";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The skin faces (§6.5). `preload: false` on all four is not an oversight:
 * which skin is active is a client fact, so preloading would push four families
 * down the wire to use at most two. Without the hint each is fetched when the
 * skin's CSS references it, and `display: "swap"` means a skinned first paint
 * lands on the fallback stack — which each skin's fallbacks were chosen for.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

const FONT_VARIABLES = [
  geistSans.variable,
  geistMono.variable,
  plexSans.variable,
  plexMono.variable,
  spaceGrotesk.variable,
  archivoBlack.variable,
].join(" ");

const DESCRIPTION =
  "A daily quote, and a habit tracker that shows you the year you had. Local-first, offline, no account.";

export const metadata: Metadata = {
  /**
   * Every URL-based metadata field resolves against this. `siteURL()` falls
   * back to the localhost Next would infer anyway, so a build with no
   * environment set stays warning-free.
   */
  metadataBase: siteURL(),
  title: {
    default: "OpenHabits — daily quotes & habits",
    template: "%s · OpenHabits",
  },
  description: DESCRIPTION,
  applicationName: "OpenHabits",
  appleWebApp: {
    capable: true,
    title: "OpenHabits",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false, date: false, address: false },
  openGraph: {
    type: "website",
    siteName: "OpenHabits",
    title: "OpenHabits — daily quotes & habits",
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: "OpenHabits", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
  // Zooming a fixed-chrome surface breaks the bottom nav against the safe area.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${FONT_VARIABLES} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Blocking, pre-paint. See lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Hydrator />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 mb-safe">
          {children}
        </main>
        <BottomNav />
        {/* Above the nav, and outside `main`, so it survives the navigation the
            action that raised it usually causes. */}
        <UndoBar />
      </body>
    </html>
  );
}
