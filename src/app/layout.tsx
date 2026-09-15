import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers";
import { TopNav } from "@/components/top-nav";
import { ToastStack } from "@/components/ui";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import "./globals.css";

const inter = localFont({
  src: [{ path: "./fonts/inter-latin.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
});

const grotesk = localFont({
  src: [{ path: "./fonts/space-grotesk-latin.woff2", weight: "300 700", style: "normal" }],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LeagueLines — Fantasy Football Sportsbook", template: "%s · LeagueLines" },
  description: "Your ESPN fantasy league, priced like a sportsbook. Model-driven spreads, totals and moneylines for every weekly matchup, with a $10,000 play-money bankroll.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <AppProviders initialUser={user ? toPublicUser(user) : null}>
          <TopNav />
          {children}
          <ToastStack />
          <footer className="border-t border-white/5 py-8 text-center text-xs text-mist-600">
            <p>
              LeagueLines is a play-money game for private leagues. No real money is wagered or paid out. Projections © ESPN; odds are derived by a normal-distribution model of team scoring.
            </p>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
