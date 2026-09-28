import { Suspense } from "react";
import { SignUpForm } from "./form-client";
import { Spinner } from "@/components/ui";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function SignUpPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={<Spinner label="Loading…" />}>
          <SignUpForm />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
