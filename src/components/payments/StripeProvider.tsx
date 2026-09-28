"use client";

import { useMemo, type ReactNode } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";

interface StripeProviderProps {
  publishableKey: string;
  clientSecret?: string;
  children: ReactNode;
}

/** Wraps children in Stripe Elements. Render only once the PaymentIntent
 *  clientSecret is available (pass it after fetching /checkout-intent). */
export function StripeProvider({ publishableKey, clientSecret, children }: StripeProviderProps) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  const options: StripeElementsOptions | undefined = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: { colorPrimary: "#0d6b46", borderRadius: "8px" },
        },
      }
    : undefined;
  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}
