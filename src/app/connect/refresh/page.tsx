"use client";

import { useState } from "react";
import { Alert, Button, Card, PageHeader } from "@/components/ui";

export default function ConnectRefreshPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resume() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/onboarding", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Could not resume onboarding");
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader title="Resume Stripe onboarding" subtitle="Your previous session expired" />
      <Card>
        <p className="text-sm text-stone-600">
          The Stripe onboarding link expired or was interrupted before you finished. No worries —
          your progress is saved. Click below to pick up where you left off.
        </p>
        {error && (
          <div className="mt-4">
            <Alert tone="red">{error}</Alert>
          </div>
        )}
        <div className="mt-6">
          <Button size="lg" onClick={resume} disabled={loading} className="w-full">
            {loading ? "Redirecting to Stripe…" : "Resume onboarding"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
