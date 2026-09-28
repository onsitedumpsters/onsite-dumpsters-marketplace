import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — Onsite Dumpsters Marketplace",
  description:
    "Privacy Policy for the Onsite Dumpsters Marketplace: what data we collect, how we use it, payments via Stripe, and your choices.",
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-stone-500">Last updated: September 28, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-stone-700">
          <section>
            <h2 className="text-lg font-bold text-stone-900">1. What we collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Account information:</strong> name, email address, password hash (passwords are never stored in plain text), and your role (client, provider, fleet owner).</li>
              <li><strong>Booking details:</strong> delivery address, ZIP code, scheduled dates, selected container size and materials.</li>
              <li><strong>Order records:</strong> order history, status timeline, photo evidence, reviews, and dispute records.</li>
              <li><strong>Provider verification:</strong> business name, service area, insurance and authority documents uploaded during verification.</li>
              <li><strong>Usage data:</strong> search queries, listing views, and ad interactions used to operate and improve the marketplace.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">2. Payments — Stripe</h2>
            <p className="mt-2">
              Payments are processed by <strong>Stripe</strong>. We never see, touch, or store your
              full card number — card details are entered directly into Stripe&apos;s secure payment
              elements. Providers and fleet owners who receive payouts onboard through{" "}
              <strong>Stripe Connect</strong>; Stripe collects and stores their identity and banking
              information under Stripe&apos;s own privacy policy. We store only references (such as
              payment intent IDs and payout statuses) needed to operate the marketplace ledger.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">3. How we use your information</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Operate the marketplace: matching, booking, payments, delivery tracking, and payouts.</li>
              <li>Verify providers and prevent fraud, abuse, and prohibited-materials violations.</li>
              <li>Send transactional messages: booking confirmations, status updates, payout notices, and dispute updates.</li>
              <li>Improve search relevance, listing quality, and the overall service.</li>
              <li>Comply with legal obligations and resolve disputes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">4. What we share</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>With your counterparty:</strong> when you book, the provider sees the delivery details needed to fulfill the job; the client sees the provider&apos;s business name, rating, and service area. Sensitive documents (such as insurance policy numbers) are never shared with counterparties.</li>
              <li><strong>With service providers:</strong> Stripe (payments), and our hosting, database, and backup providers — only what is needed to operate the service.</li>
              <li><strong>Legal:</strong> when required by law or to protect the safety and integrity of the marketplace.</li>
            </ul>
            <p className="mt-2">We do not sell your personal information.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">5. Data retention and security</h2>
            <p className="mt-2">
              Order, payment, and ledger records are retained as long as needed for accounting,
              tax, and dispute-resolution purposes. Uploaded documents are stored in secure,
              access-controlled storage. We use encrypted connections (HTTPS), hashed passwords,
              role-based access controls, and audit logging on administrative and
              money-movement actions. No system is perfectly secure, and we cannot guarantee
              absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">6. Your choices</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Update your account details from your dashboard at any time.</li>
              <li>Request a copy or deletion of your personal data by emailing us (subject to records we must retain by law).</li>
              <li>Opt out of non-transactional messages; transactional order updates cannot be disabled while you have active orders.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">7. Children</h2>
            <p className="mt-2">
              The marketplace is not directed to children under 18, and we do not knowingly collect
              their personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">8. Changes</h2>
            <p className="mt-2">
              We may update this policy; material changes will be posted here with a revised date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900">9. Contact</h2>
            <p className="mt-2">
              Privacy questions or data requests:{" "}
              <a href="mailto:dumpstersonsite@gmail.com" className="font-semibold text-emerald-700 hover:underline">
                dumpstersonsite@gmail.com
              </a>
              . See also our{" "}
              <Link href="/terms" className="font-semibold text-emerald-700 hover:underline">
                Terms of Service
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
