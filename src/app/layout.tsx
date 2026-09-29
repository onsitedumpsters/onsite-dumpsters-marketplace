import type { Metadata } from "next";
import "./globals.css";

const SITE_NAME = "Onsite Dumpsters Marketplace";
const SITE_TITLE =
  "Onsite Dumpsters Marketplace — Compare & Book Dumpster Rentals in Orlando, FL";
const SITE_DESCRIPTION =
  "Book verified dumpster rentals in Orlando, Florida with total-price transparency, delivery-protected payments, and live delivery tracking.";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://onsitedumpsterservice.com";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s | Onsite Dumpsters Marketplace",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "dumpster rental Orlando",
    "roll off dumpster Orlando FL",
    "dumpster rental near me",
    "construction dumpster rental Florida",
    "10 yard dumpster rental",
    "20 yard dumpster rental",
    "30 yard dumpster rental",
    "40 yard dumpster rental",
    "Orlando dumpster prices",
    "yard waste dumpster Orlando",
  ],
  authors: [{ name: "Onsite Dumpsters", url: "https://onsitedumpsterservice.com" }],
  creator: "Onsite Dumpsters",
  publisher: "Onsite Dumpsters",
  category: "marketplace",
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  themeColor: "#064e3b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-stone-50 font-sans text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
