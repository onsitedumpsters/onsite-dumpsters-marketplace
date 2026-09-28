import { Alert, Card } from "@/components/ui";

/**
 * Rendered by the checkout page when Stripe is NOT configured.
 * Explicit "Payments not configured" panel with setup guidance — never a
 * silent fake payment, and no pay button.
 */
export function NotConfiguredPanel({ orderNumber }: { orderNumber?: string }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <h2 className="text-xl font-bold text-stone-900">Payments not configured</h2>
      <p className="mt-2 text-sm text-stone-600">
        {orderNumber ? (
          <>
            Order <strong>{orderNumber}</strong> is ready, but{" "}
          </>
        ) : (
          "But "
        )}
        the marketplace owner hasn&apos;t connected Stripe yet, so no payment can be taken right
        now. <strong>No demo or fake checkout is performed</strong> — your card will not be charged
        and no test payment will be simulated.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-stone-700">
        <li>
          Create a Stripe account at{" "}
          <a
            className="font-medium text-emerald-800 underline"
            href="https://dashboard.stripe.com/register"
            target="_blank"
            rel="noreferrer"
          >
            dashboard.stripe.com
          </a>{" "}
          and switch it to <strong>test mode</strong>.
        </li>
        <li>
          Copy the test <code>Secret key</code> and <code>Publishable key</code> from Developers →
          API keys.
        </li>
        <li>
          Set <code>STRIPE_SECRET_KEY</code>, <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>, and{" "}
          <code>STRIPE_WEBHOOK_SECRET</code> in the app&apos;s environment.
        </li>
        <li>Follow the full go-live checklist in the setup guide below.</li>
      </ol>
      <div className="mt-4">
        <Alert tone="amber">
          Setup guide:{" "}
          <a
            href="https://github.com/onsitedumpsters/onsite-dumpsters-marketplace/blob/main/docs/STRIPE_SETUP.md"
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            docs/STRIPE_SETUP.md
          </a>
        </Alert>
      </div>
    </Card>
  );
}
