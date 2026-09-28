import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Onsite Dumpsters Marketplace — Compare & Book Dumpster Rentals in Orlando, FL",
    template: "%s | Onsite Dumpsters Marketplace",
  },
  description:
    "Book verified dumpster rentals in Orlando, Florida with total-price transparency, escrow-protected payments, and live delivery tracking.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    siteName: "Onsite Dumpsters Marketplace",
  },
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
