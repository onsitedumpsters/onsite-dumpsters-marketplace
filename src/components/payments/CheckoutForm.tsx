"use client";

import { useCallback, useEffect, useState } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { StripeProvider } from "./StripeProvider";
import { FeeBreakdownTable } from "@/components/FeeBreakdown";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import type { FeeBreakdown } from "@/lib/fees";

interface CheckoutFormProps {
  orderId: string;
  orderNumber: string;
  publishableKey: string;
  breakdown: FeeBreakdown;
}

type Phase = "loading" | "ready" | "polling" | "done" | "error";

function PaymentForm({ orderId, onConfirmed }: { orderId: string; onConfirmed: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/checkout/${orderId}?paid=1` },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }
    if (paymentIntent && ["requires_capture", "succeeded", "processing"].includes(paymentIntent.status)) {
      onConfirmed();
    } else {
      setError(`Unexpected payment status: ${paymentIntent?.status ?? "unknown"}. Please contact support.`);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <Alert tone="red">{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={!stripe || submitting}>
        {submitting ? "Processing…" : "Authorize payment"}
      </Button>
      <p className="text-center text-xs text-stone-500">
        Your card is only <strong>authorized</strong> now — funds are captured when your dumpster is
        delivered. The rental amount is held in escrow; fees are non-refundable.
      </p>
    </form>
  );
}

function PaymentPoller({ orderId, onBooked }: { orderId: string; onBooked: () => void }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/orders/${orderId}/payment-status`);
        const data = await res.json();
        if (cancelled) return;
        if (data.orderStatus === "booked") {
          clearInterval(timer);
          onBooked();
        } else if (data.paymentStatus === "failed") {
          clearInterval(timer);
          setError("The payment failed. Please go back and try a different payment method.");
        } else if (attempts > 36) {
          clearInterval(timer);
          setError("Still waiting on payment confirmation — please check your dashboard for the order status.");
        }
      } catch {
        // keep polling
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId, onBooked]);

  if (error) return <Alert tone="red">{error}</Alert>;
  return <Spinner label="Confirming your payment with the bank…" />;
}

export function CheckoutForm({ orderId, orderNumber, publishableKey, breakdown }: CheckoutFormProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goPolling = useCallback(() => setPhase("polling"), []);
  const goDone = useCallback(() => setPhase("done"), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/checkout-intent`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? data.error ?? "Could not start checkout");
        if (cancelled) return;
        setClientSecret(data.clientSecret);
        // Redirected back from a bank 3-D Secure / redirect flow.
        const returned = new URLSearchParams(window.location.search).get("paid") === "1";
        setPhase(returned ? "polling" : "ready");
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (phase === "loading") return <Spinner label="Preparing secure checkout…" />;
  if (phase === "error") return <Alert tone="red">{error ?? "Checkout failed to start."}</Alert>;

  if (phase === "done") {
    return (
      <Card className="text-center">
        <p className="text-2xl">🎉</p>
        <h2 className="mt-2 text-xl font-bold text-stone-900">Booking confirmed!</h2>
        <p className="mt-2 text-sm text-stone-600">
          Payment authorized for order <strong>{orderNumber}</strong>. Your hauler has been notified
          and will confirm your delivery window shortly.
        </p>
        <div className="mt-6">
          <Button size="lg" onClick={() => (window.location.href = "/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-base font-bold text-stone-900">Order summary</h2>
        <FeeBreakdownTable breakdown={breakdown} showPolicy />
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-bold text-stone-900">Payment</h2>
        {phase === "polling" ? (
          <PaymentPoller orderId={orderId} onBooked={goDone} />
        ) : clientSecret ? (
          <StripeProvider publishableKey={publishableKey} clientSecret={clientSecret}>
            <PaymentForm orderId={orderId} onConfirmed={goPolling} />
          </StripeProvider>
        ) : (
          <Spinner label="Loading payment form…" />
        )}
      </Card>
    </div>
  );
}
