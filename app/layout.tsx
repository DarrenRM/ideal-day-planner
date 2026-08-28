import type { Metadata } from "next";
import "./globals.css";

// Vinext currently serializes only the core viewport keys. Keeping viewport-fit in
// this value produces one standards-compliant viewport tag instead of a duplicate.
export const viewport = {
  width: "device-width, viewport-fit=cover",
  themeColor: "#0a0c0f",
};

export const metadata: Metadata = {
  title: "Idealized day",
  description: "A calm, reorderable daily wellness protocol.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ideal Day",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
