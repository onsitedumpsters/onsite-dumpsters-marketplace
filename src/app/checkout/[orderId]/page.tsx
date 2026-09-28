import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getPublishableKey, isStripeConfigured } from "@/lib/stripe";
import { CheckoutForm } from "@/components/payments/CheckoutForm";
import { NotConfiguredPanel } from "@/components/payments/NotConfiguredPanel";
import { Alert, Card, PageHeader } from "@/components/ui";
import type { FeeBreakdown } from "@/lib/fees";

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const role = (session.user as { role?: string }).role;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { listing: { select: { title: true } } },
  });
  if (!order) notFound();
  if (order.clientId !== session.user.id && role !== "admin") notFound();

  if (order.status !== "quote") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <PageHeader title="Checkout" subtitle={`Order ${order.orderNumber}`} />
        <Alert tone="amber">
          This order is already <strong>{order.status}</strong> and can no longer be checked out.
        </Alert>
      </main>
    );
  }

  const breakdown: FeeBreakdown = {
    rentalSubtotalCents: order.rentalSubtotalCents,
    bookingFeeCents: order.bookingFeeCents,
    droppingFeeCents: order.droppingFeeCents,
    processingFeeCents: order.processingFeeCents,
    takeRateCents: order.takeRateCents,
    grandTotalCents: order.grandTotalCents,
    haulerPayoutCents: order.haulerPayoutCents,
    platformRevenueCents:
      order.bookingFeeCents + order.droppingFeeCents + order.processingFeeCents + order.takeRateCents,
  };

  const stripeReady = isStripeConfigured() && getPublishableKey() !== null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Secure checkout" subtitle={`Order ${order.orderNumber} — ${order.listing.title}`} />
      {!stripeReady ? (
        <NotConfiguredPanel orderNumber={order.orderNumber} />
      ) : (
        <CheckoutForm
          orderId={order.id}
          orderNumber={order.orderNumber}
          publishableKey={getPublishableKey() as string}
          breakdown={breakdown}
        />
      )}
      {!stripeReady && (
        <Card className="mx-auto mt-6 max-w-2xl">
          <h3 className="text-sm font-bold text-stone-900">Why am I seeing this?</h3>
          <p className="mt-1 text-sm text-stone-600">
            This marketplace processes real payments through Stripe (test mode). Until the owner
            connects Stripe, checkout stays disabled rather than simulating a payment.
          </p>
        </Card>
      )}
    </main>
  );
}
