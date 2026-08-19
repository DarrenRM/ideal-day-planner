import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Idealized day",
  description: "A calm, reorderable daily wellness protocol.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
