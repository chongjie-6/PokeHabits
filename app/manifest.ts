import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenHabits — daily quotes & habits",
    short_name: "OpenHabits",
    description:
      "A daily quote worth reading, and a habit tracker that shows you the year you had.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfbf9",
    theme_color: "#216e39",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android crops non-maskable icons into a circle and eats the artwork's
      // edges, so a maskable variant is required rather than optional.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Log today", url: "/" },
      { name: "Your year", url: "/stats" },
    ],
  };
}
