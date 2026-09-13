import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Travel Bot",
  description: "Flights, stays, payments, and travel documents in one secure place.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg?v=main-robot-20260913",
    shortcut: "/favicon.svg?v=main-robot-20260913",
    apple: "/icon-192.png?v=main-robot-20260913",
  },
};
export const viewport: Viewport = { width:"device-width",initialScale:1,themeColor:"#173c34" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
