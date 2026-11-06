import type { MetadataRoute } from "next";

// Lets people install Niu Real Book on a phone, tablet or computer (Account > Help > Install the app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Niu Real Book",
    short_name: "Real Book",
    description: "Setlists, charts, a backing band and your band in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#faf9f6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
