import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoCalendar",
  description: "Turn a roster screenshot into calendar files with travel time and reminders.",
  applicationName: "AutoCalendar",
  // "Add to Home Screen" on iPhone opens it full screen like an app.
  appleWebApp: { capable: true, title: "AutoCalendar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
