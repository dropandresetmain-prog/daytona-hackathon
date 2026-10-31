import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Common Ground | Event Networking Demo",
  description:
    "Find a useful conversation at a fictional event. Matching can run in a Daytona sandbox.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={sans.className}>{children}</body>
    </html>
  );
}
