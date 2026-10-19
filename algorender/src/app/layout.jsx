import { Analytics } from "@vercel/analytics/next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SITE_URL } from "@/lib/site";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The display face: page titles, card titles and big numbers (font-display).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Algorender - Algorithm & Data Structure Visualizer",
  description: "Interactive visualizations of algorithms and data structures to help you understand how they work. Learn through step-by-step execution with real-time statistics and educational content.",
};

export default function RootLayout({ children }) {
  return (
    // The theme script may stamp data-theme before React hydrates.
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        {/* Next moves beforeInteractive scripts into <head>, ahead of hydration, so a saved theme never flashes. */}
        <Script id="theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
        {children}
        <Analytics />
        <ServiceWorker />
      </body>
    </html>
  );
}
