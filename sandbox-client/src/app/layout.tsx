import type { Metadata } from "next";
import { JetBrains_Mono, EB_Garamond } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SANDBOX --- Live Stock Market Trading Terminal",
  description: "Real-time stock market simulation web application for competitive trading rounds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable} ${ebGaramond.variable}`}>
      <body className="antialiased bg-[#090a0f] text-[#d4d4d8] font-mono selection:bg-[#27272a] selection:text-[#f4f4f5] min-h-screen">
        {children}
      </body>
    </html>
  );
}
