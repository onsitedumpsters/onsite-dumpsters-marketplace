import type { Metadata } from "next";
import { QuizClient } from "./quiz-client";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "What size dumpster do I need?",
  description:
    "Take the 60-second dumpster size quiz: answer 4 questions about your project and get the right dumpster size for your Orlando, FL rental.",
  alternates: { canonical: "/quiz" },
};

export default function QuizPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <QuizClient />
      </main>
      <SiteFooter />
    </>
  );
}
