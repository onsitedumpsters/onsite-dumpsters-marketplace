import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchClient } from "./search-client";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Search dumpster rentals",
  description:
    "Search verified dumpster rentals in Orlando, FL by ZIP code, dumpster type, size, and total price. Every listing shows one all-in total — no hidden fees.",
  alternates: { canonical: "/search" },
};

export default function SearchPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Suspense fallback={<Spinner label="Loading search…" />}>
          <SearchClient />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
