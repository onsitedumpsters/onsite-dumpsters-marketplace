// Stripe client + configuration gate.
// QUALITY MANDATE: there is NO silent demo/fake checkout. If Stripe keys are
// absent, isStripeConfigured() is false and checkout APIs must return
// 503 { code: "STRIPE_NOT_CONFIGURED" } with setup guidance. All payment
// flows require real Stripe TEST keys end-to-end.

import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error(
      "STRIPE_NOT_CONFIGURED: set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET) per docs/STRIPE_SETUP.md",
    );
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: "2025-08-27.basil",
      typescript: true,
    });
  }
  return stripeSingleton;
}

export const STRIPE_NOT_CONFIGURED_RESPONSE = {
  code: "STRIPE_NOT_CONFIGURED",
  message:
    "Payments are not configured yet. The marketplace owner must connect Stripe (test keys) — see docs/STRIPE_SETUP.md. No payment was created and no fake checkout was performed.",
  setupGuide: "/docs/STRIPE_SETUP.md",
};

export function getPublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}
