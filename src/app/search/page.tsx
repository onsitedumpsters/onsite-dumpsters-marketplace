import { Suspense } from "react";
import { SearchClient } from "./search-client";
import { Spinner } from "@/components/ui";

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner label="Loading search…" />}>
      <SearchClient />
    </Suspense>
  );
}
