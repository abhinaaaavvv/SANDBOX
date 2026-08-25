import type { Metadata } from "next";
import { Bodoni_Moda } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Type system:
 *   Primary   — Google Sans: the entire application UI.
 *   Editorial — Bodoni Moda: wordmark, view titles, panel headings and
 *               major statements. The serif voice of the brand.
 *
 * Note: console providers (Supabase auth/realtime/sandbox stores) live in
 * components/shared/ConsoleProviders.tsx, mounted only by the participant
 * and admin (console) layouts — public routes stay JS-light.
 */
const googleSans = localFont({
  src: [
    { path: "./fonts/google-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/google-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/google-sans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-google-sans",
  display: "swap",
});

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SANDBOX",
  description: "A live market simulation where teams trade, react, and compete.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${googleSans.variable} ${bodoniModa.variable}`}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions inject attributes
          (e.g. __processed_<uuid>__) into <body> before hydration; without
          this flag every extension user gets a hydration mismatch error.
          Only affects attributes/children one level deep — real component
          mismatches still surface normally. */}
      <body
        className="min-h-screen bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
