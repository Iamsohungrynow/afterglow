import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";

// Serif is used for the wordmark and the landing headline only: Afterglow is a private-bank
// style credit line, and the serif carries that register. Everything else is Geist.
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display-serif",
  display: "swap",
});

const DESCRIPTION = "Fixed-rate USDG credit lines against tokenized stocks, on Robinhood Chain.";

export const metadata: Metadata = {
  // Resolves relative URLs in link previews (the Open Graph image, openGraph.url).
  metadataBase: new URL("https://afterglow-credit.vercel.app"),
  title: "Afterglow",
  description: DESCRIPTION,
  // app/icon.svg, app/apple-icon.png and app/opengraph-image.tsx are picked up by Next's file conventions.
  openGraph: {
    title: "Afterglow",
    description: DESCRIPTION,
    url: "/",
    siteName: "Afterglow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Afterglow",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`}>
      <body className="grain min-h-[100dvh]">{children}</body>
    </html>
  );
}
