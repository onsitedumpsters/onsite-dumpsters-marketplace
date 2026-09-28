import { Suspense } from "react";
import { SearchClient } from "./search-client";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Spinner } from "@/components/ui";

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
