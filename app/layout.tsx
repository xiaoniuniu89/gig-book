import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/AppProvider";
import { TopBar } from "@/components/TopBar";
import { Dock } from "@/components/Dock";
import { Toast } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gig Book",
  description: "Setlists from iReal Pro with analysed chord charts, a built-in backing band and Spotify recordings.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%238C5F0E'/%3E%3Ctext x='16' y='23' font-family='Georgia,serif' font-size='20' font-weight='700' text-anchor='middle' fill='%23fff'%3EG%3C/text%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600&family=Kalam:wght@700&display=swap" />
      </head>
      <body data-docksize="full">
        <AppProvider>
          <TopBar />
          <main><div className="wrap" id="view">{children}</div></main>
          <Toast />
          <Dock />
        </AppProvider>
      </body>
    </html>
  );
}
