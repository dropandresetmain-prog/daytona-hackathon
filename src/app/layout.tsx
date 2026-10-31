import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Common Ground | Event Networking Demo",
  description:
    "Find a useful conversation at a fictional event. Local mock data only.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
