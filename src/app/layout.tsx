import type { Metadata } from "next";
import { Geist, EB_Garamond } from "next/font/google";
import { SandboxProvider } from "@/context/SandboxContext";
import { RealtimeProvider } from "@/lib/realtime";
import { AuthProvider } from "@/lib/auth-context";
import { CompetitionContextProvider } from "@/lib/competition-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Type system (docs/DESIGN.md §2):
 *   Primary   — Geist Sans: the entire application UI.
 *   Secondary — EB Garamond: wordmark and editorial statements only.
 *
 * Geist's tabular numerals keep financial columns scannable without a
 * monospace face.
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
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
      className={`dark ${geistSans.variable} ${ebGaramond.variable}`}
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
        <RealtimeProvider>
          <AuthProvider>
            <CompetitionContextProvider>
              <SandboxProvider>
                <TooltipProvider>
                  {children}
                  <Toaster />
                </TooltipProvider>
              </SandboxProvider>
            </CompetitionContextProvider>
          </AuthProvider>
        </RealtimeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
