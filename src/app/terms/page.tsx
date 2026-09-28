import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Terms of Service — Onsite Dumpsters Marketplace",
  description:
    "Terms of Service for the Onsite Dumpsters Marketplace: booking, fees, cancellation policy, delivery-protected payments, reviews, and disputes.",
};

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-stone-500">Last updated: September 28, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-stone-700">
          <section>
            <h2 className="text-lg font-bold text-stone-900">1. The marketplace</h2>
            <p className="mt-2">
              Onsite Dumpsters Marketplace (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates an online
              marketplace that connects customers (&ldquo;clients&rdquo;) with independent dumpster
              hauling businesses (&ldquo;providers&rdquo;) and container fleet owners
              (&ldquo;fleet owners&rdquo;). Providers and fleet owners are independent businesses, not
              employees or agents of Onsite Dumpsters. We facilitate discovery, booking, payment
              processing, and dispute resolution; the hauling service itself is performed by the
              provider you select.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">2. Accounts</h2>
            <p className="mt-2">
              You must provide accurate information when creating an account and keep your
              credentials confidential. You are responsible for activity under your account. We may
              suspend accounts that violate these terms, submit fraudulent bookings, or abuse the
              platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">3. Booking and fees</h2>
            <p className="mt-2">
              Every listing shows one total price before you book. The customer grand total is:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Rental subtotal</strong> — the hauler&apos;s price for the job.</li>
              <li><strong>$19.00 booking fee</strong> — flat per order, platform revenue.</li>
              <li><strong>$29.00 drop-off fee</strong> — flat per delivery, platform revenue.</li>
              <li><strong>2.9% + $0.30 payment processing fee</strong> — calculated on the subtotal
                plus booking and drop-off fees, labeled &ldquo;Payment processing fee
                (Stripe)&rdquo;.</li>
            </ul>
            <p className="mt-2">
              An <strong>8% take rate</strong> is deducted from the hauler&apos;s payout and is not
              added to your total. Fee amounts are versioned and admin-configurable; the schedule in
              effect at the time of booking always applies and is shown itemized at checkout, on
              your receipt, and on your order page. <strong>All fees (booking, drop-off,
              processing, and take rate) are non-refundable under all circumstances.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">4. Delivery-protected payments</h2>
            <p className="mt-2">
              When you book, your card is <strong>authorized</strong> for the grand total but not
              charged immediately. The rental amount is held until your dumpster is delivered and
              confirmed — it is released to the hauler only after delivery confirmation. The
              booking, drop-off, and processing fees are platform fees captured at booking and are
              non-refundable. This is an authorization-and-capture payment flow processed by Stripe;
              it is not a legal escrow arrangement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">5. Cancellation policy</h2>
            <p className="mt-2">
              Only the rental subtotal is ever eligible for cancellation refunds:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Cancel <strong>more than 48 hours</strong> before scheduled delivery: full refund of the rental subtotal.</li>
              <li>Cancel <strong>24–48 hours</strong> before scheduled delivery: 50% refund of the rental subtotal.</li>
              <li>Cancel <strong>less than 24 hours</strong> before delivery, or after dispatch: no refund.</li>
            </ul>
            <p className="mt-2">
              Booking, drop-off, and processing fees are <strong>never refunded</strong>, including
              on cancellation. Adjustments (overweight, extra days, contamination) are charged
              separately with itemized evidence and may be disputed through the dispute center.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">6. Your responsibilities as a client</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Provide accurate delivery details and ensure clear placement access on the scheduled day.</li>
              <li>Acknowledge the prohibited-materials list before booking. Hazardous waste, tires, batteries, liquids, and asbestos are never permitted.</li>
              <li>Confirm whether your placement needs a permit (e.g., street placement in Orlando generally requires a City of Orlando right-of-way permit; HOA rules may apply).</li>
              <li>Do not overload containers beyond the included tonnage; overweight and contamination charges apply per the listing&apos;s terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">7. Providers and fleet owners</h2>
            <p className="mt-2">
              Providers must maintain required insurance and authority documentation, keep listings
              accurate (sizes, materials, rate cards, availability), accept jobs within stated
              service-level windows, upload photo proof of delivery and pickup, and complete payouts
              through Stripe Connect. Payouts are released per Stripe&apos;s payout schedule after
              job completion, minus the platform take rate and any adjustments. Fleet owners are
              responsible for the condition and roadworthiness of registered containers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">8. Reviews</h2>
            <p className="mt-2">
              Reviews may only be left for completed, job-verified orders — one review per order.
              Reviews must reflect your genuine experience. We may remove reviews that are
              fraudulent, abusive, or unrelated to the job.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">9. Disputes</h2>
            <p className="mt-2">
              If something goes wrong, open a dispute from your order page with a reason,
              description, and any photo evidence. While a dispute is open, the held payment is
              frozen pending review. Our team resolves disputes within 72 hours. Outcomes may
              include refund of the rental amount (in whole or part), release of the held payment
              to the hauler, or a split resolution. Platform fees are never refunded as part of a
              dispute outcome.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">10. Advertising</h2>
            <p className="mt-2">
              Fleet owners and providers may purchase promotional placements (sponsored listing
              boosts, homepage features, category banners). Sponsored placements are always labeled
              and never outrank organic results on relevance alone. Ad spend is platform revenue,
              non-refundable, and does not go through the delivery-protected payment flow.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">11. Limitation of liability</h2>
            <p className="mt-2">
              To the maximum extent permitted by law, Onsite Dumpsters is not liable for the acts or
              omissions of independent providers and fleet owners, including service quality,
              timeliness, or property damage arising from hauling services. Our total liability for
              any claim arising from your use of the marketplace is limited to the fees you paid to
              us for the order in question.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">12. Changes</h2>
            <p className="mt-2">
              We may update these terms; material changes will be posted here with a revised date.
              Continued use of the marketplace after changes take effect constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">13. Contact</h2>
            <p className="mt-2">
              Questions about these terms:{" "}
              <a href="mailto:dumpstersonsite@gmail.com" className="font-semibold text-emerald-700 hover:underline">
                dumpstersonsite@gmail.com
              </a>
              . See also our{" "}
              <Link href="/privacy" className="font-semibold text-emerald-700 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
