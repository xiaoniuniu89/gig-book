import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/AppProvider";
import { Gate } from "@/components/Gate";
import { Toast } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Niu Real Book", template: "%s · Niu Real Book" },
  description: "A real book for working jazz musicians: setlists from iReal Pro, analysed charts, a built-in backing band, licks and your band in one place.",
  applicationName: "Niu Real Book",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* the saved light/dark choice, before first paint so there's no flash */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('gigbook-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600&family=Kalam:wght@700&display=swap" />
      </head>
      <body data-docksize="full">
        <AppProvider>
          <Gate>{children}</Gate>
          <Toast />
        </AppProvider>
      </body>
    </html>
  );
}
