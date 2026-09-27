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

export const metadata: Metadata = {
  title: "Afterglow",
  description: "Fixed-rate USDG credit lines against tokenized stocks, on Robinhood Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`}>
      <body className="grain min-h-[100dvh]">{children}</body>
    </html>
  );
}
