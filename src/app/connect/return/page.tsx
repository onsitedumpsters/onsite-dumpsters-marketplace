"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, PageHeader, Spinner } from "@/components/ui";

interface ConnectStatus {
  onboarded: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export default function ConnectReturnPage() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/connect/status");
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setError("Could not check your onboarding status. Please refresh the page.");
      }
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const ready = status?.chargesEnabled === true && status?.payoutsEnabled === true;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader title="Stripe Connect onboarding" subtitle="Hauler payout setup" />
      <Card>
        {error && <Alert tone="red">{error}</Alert>}
        {!status && !error && <Spinner label="Checking your Stripe account status…" />}
        {status && !ready && (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">
              Stripe is still processing your onboarding. This usually takes a minute or two.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge tone={status.onboarded ? "green" : "amber"}>
                Account created: {status.onboarded ? "yes" : "pending"}
              </Badge>
              <Badge tone={status.chargesEnabled ? "green" : "amber"}>
                Card payments: {status.chargesEnabled ? "enabled" : "pending"}
              </Badge>
              <Badge tone={status.payoutsEnabled ? "green" : "amber"}>
                Payouts: {status.payoutsEnabled ? "enabled" : "pending"}
              </Badge>
            </div>
            <Spinner label="Waiting for Stripe to finish verification…" />
          </div>
        )}
        {status && ready && (
          <div className="space-y-4 text-center">
            <p className="text-2xl">✅</p>
            <h2 className="text-lg font-bold text-stone-900">You&apos;re all set!</h2>
            <p className="text-sm text-stone-600">
              Your Stripe Express account is active — you can accept jobs and receive payouts.
            </p>
            <Button size="lg" onClick={() => (window.location.href = "/dashboard")}>
              Go to dashboard
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
