import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import localFont from "next/font/local";
import { SandboxProvider } from "@/context/SandboxContext";
import { RealtimeProvider } from "@/lib/realtime";
import { AuthProvider } from "@/lib/auth-context";
import { CompetitionContextProvider } from "@/lib/competition-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/**
 * Google Sans is a restricted-license family served by the Google Fonts API
 * but not exposed through next/font/google. We self-host the Latin-subset
 * woff2 files (400/500/600/700) via next/font/local — the proper Google Sans
 * setup — so the app never falls back to a substituted family.
 */
const googleSans = localFont({
  src: [
    { path: "./fonts/google-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/google-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/google-sans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/google-sans-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-google-sans",
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
      className={`dark ${googleSans.variable} ${ebGaramond.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
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
      </body>
    </html>
  );
}
