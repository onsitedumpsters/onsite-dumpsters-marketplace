# Onsite Dumpsters Marketplace — Build Specification v1.0
Date: 2026-09-28. Owner: Onsite Dumpsters. Launch market: Orlando, FL.

## 1. What to build
A production-grade, multi-sided dumpster rental marketplace web app ("Onsite Dumpsters Marketplace"):
Next.js 15 App Router + TypeScript + Tailwind CSS, Prisma ORM + PostgreSQL, Auth.js (credentials +
Google OAuth), Stripe (PaymentIntents + Connect Express + webhooks), Leaflet/OpenStreetMap for maps
(no API key), zod validation, bcrypt password hashing. Deployed: frontend on Vercel, Postgres on
Render, code on GitHub `onsitedumpsters` account. Fully responsive (mobile-first), modern, secure.

## 2. Personas & RBAC (roles: client, provider, fleet_owner, admin)
- **Client** (homeowner / contractor / property manager): location + size guided search, total-price
  comparison, booking, Stripe checkout, live order tracking timeline, photo evidence, reviews,
  receipts, saved job specs, rebook.
- **Provider** (hauler/driver): onboarding + verification (insurance, authority, service area),
  listing management (sizes, materials, rate cards, availability calendar), accept/dispatch jobs,
  delivery & pickup photo proof, weight tickets, swap/extension handling, payout dashboard,
  ratings.
- **Fleet owner**: container fleet registry (per-container: size, type, condition, photos, depot
  location), assign containers to providers, fleet utilization + revenue reporting, **Promote module**
  (see §7) to advertise equipment, payouts.
- **Admin** (marketplace owner): verification queue, fee-schedule management (versioned), escrow
  ledger + reconciliation, dispute center, ad-inventory management, reports/analytics
  (GMV, take rate, fees split, fill rate, dispute rate, contribution by city×category×channel),
  content/category pages, audit log.

## 3. FEE MODEL (binding — from the user, overrides all defaults)
Currency USD. All fees below are **charged to the customer at checkout, kept by the platform, and
NEVER refundable** under any cancellation/refund scenario. Show an itemized breakdown at checkout,
on receipts, on order detail pages, and in the admin ledger. Fee amounts are admin-configurable
and versioned (fee_schedule table); defaults:
- `booking_fee` = $19.00 flat per order — platform revenue, non-refundable.
- `dropping_fee` = $29.00 flat per delivery ("drop-off") — platform revenue, non-refundable.
- `processing_fee` = 2.9% + $0.30 of the **customer grand total**, labeled "Payment processing fee
  (Stripe)" — collected **separately as its own line item at transaction time**, kept by the
  platform to offset Stripe's actual deduction, non-refundable. Compute on the pre-processing
  subtotal: processing_fee = round((subtotal + booking + dropping) * 0.029 + 0.30).
- `take_rate` = 8% of the **rental subtotal** (hauler's price) — platform revenue, deducted from
  the hauler payout, non-refundable once captured.
- `rental_subtotal` = hauler's listed price for the job (base + included days/tons). This is the
  ONLY escrowed portion.
- Customer grand total = rental_subtotal + booking_fee + dropping_fee + processing_fee.
- Hauler payout = rental_subtotal − take_rate amount − any platform-paid adjustments.
- Cancellation policy (configurable): >48h before delivery → rental_subtotal refunded in full;
  24–48h → 50% of rental_subtotal refunded; <24h or after dispatch → 0% refunded. **Fees
  (booking, dropping, processing, take rate on captured amounts) are never refunded.** Display this
  policy verbatim at checkout with a required checkbox.

## 4. ESCROW PAYMENT FLOW (Stripe)
- Stripe Connect with Express accounts for providers/fleet owners (onboarding link flow,
  `account.updated` webhook gates payouts on `charges_enabled`).
- Booking: create PaymentIntent for the grand total with `capture_method: manual`
  (authorize only), `application_fee_amount` = booking+dropping+processing+take_rate amounts in
  cents, `transfer_data.destination` = provider's Connect account, `transfer_group` = order id.
  Funds sit authorized = escrow.
- Milestones: on **delivery confirmed** (photo proof uploaded + provider marks delivered, or client
  confirms), capture the PaymentIntent (minus any pre-delivery cancellation). On **pickup
  completed**, mark order completed; payout transfer settles to provider per Connect schedule.
- Adjustments (overweight, extra days, contamination): separate PaymentIntent charged to the saved
  payment method, itemized, evidence-attached (weight ticket photo); disputed adjustments go to the
  dispute center and hold the delta in escrow.
- Webhooks (signature-verified): payment_intent.succeeded / .canceled, charge.refunded,
  account.updated, payout.paid. Idempotent handlers; every money movement writes a ledger row.
- **Demo payments mode**: if `STRIPE_SECRET_KEY` is unset, the app runs in clearly-labeled DEMO
  mode — checkout simulates authorization/capture/release with the same ledger entries and fee
  math, so every flow is clickable end-to-end before real Stripe onboarding. Never mix demo and
  live money; admin banner shows mode.
- PCI: never touch raw card data; Stripe Elements / Payment Element only.

## 5. Booking & fulfillment state machine
`quote → booked(payment authorized) → accepted → dispatched → delivered(photo proof) →
in_service → pickup_scheduled → picked_up → completed(escrow released) → reviewed`,
with `cancelled` and `disputed` branches. Every transition writes an order_event row and is shown
on a tracking timeline (client) and dispatch board (provider). SLA clocks: acceptance ≤ 4h,
delivery within promised window; breaches flag admin and affect ranking.

## 6. Location system (maps + images)
- Leaflet + OpenStreetMap tiles, `react-leaflet`. No API key.
- Search: address/ZIP input → geocode via Nominatim (client-side, debounced, cached) → map
  centers; listings within service radius render as photo markers (custom divIcon with the listing's
  primary image thumbnail); clicking opens a rich popup card (image, size, total price, provider
  rating, Book button).
- Listing detail: embedded map with depot pin + approximate service-area circle + photo gallery.
- Provider onboarding: draw/select service area (ZIP list + radius); stored as PostGIS-free
  lat/lng + radius_miles (haversine in query).
- Seed: Orlando metro depot coordinates + ~10 fictional haulers, ~24 listings across 10/15/20/30/40
  yd + commercial categories, each with picsum/placeholder images flagged `rights_status` and an
  asset register page noting they must be replaced with owned photography.

## 7. ADVERTISE / MONETIZE module (fleet owners promote equipment)
- "Promote" dashboard for fleet_owner (and provider) roles: pick equipment/listing → choose
  placement → pay → live.
- Placements: (a) Sponsored listing boost — top-3 pinned slots in search results with a clear
  "Sponsored" badge; (b) Homepage featured carousel; (c) Category-page banner slot.
- Pricing (admin-configurable): e.g., sponsored boost $49/7 days, homepage feature $99/7 days,
  category banner $149/7 days; or CPC. v1: flat-rate time slots, Stripe Checkout one-time payment,
  platform keeps 100% (no escrow), non-refundable.
- Rules (from strategy): sponsored NEVER outranks organic on relevance alone — separate labeled
  slots; max 3 sponsored per search page; frequency caps; admin approves creatives; performance
  stats (impressions, clicks, CTR, bookings attributed) per campaign.
- Tables: ad_placements, ad_campaigns, ad_events (impression/click), ad_invoices.

## 8. Reporting & analytics
- Admin: KPI cards (GMV booked vs settled, platform revenue split by fee type, escrow outstanding,
  payouts pending, fill rate, dispute rate, CAC input), charts (orders/revenue over time, by
  city×category×channel), per-order contribution (customer total − payout − card cost − refunds),
  CSV exports, audit log viewer.
- Provider: earnings, upcoming payouts, acceptance/on-time stats, rating trend.
- Fleet owner: utilization %, revenue per container, maintenance log, ad campaign ROI.

## 9. Trust & safety
Verification checklist for providers (docs upload, insurance expiry tracking), job-verified reviews
only (one per completed order), prohibited-materials acknowledgment at checkout, permit guidance
per locality (Orlando seed rules), dispute center with evidence attachments + timed escalation,
suspension rules, rate limiting, audit log on all admin/money actions.

## 10. Security requirements (non-negotiable)
- zod validation on every API input; Prisma parameterized queries only; bcryptjs (12 rounds).
- Auth.js sessions, RBAC middleware on all `/api` + dashboard routes; CSRF via SameSite cookies;
  security headers (CSP, HSTS, X-Frame-Options, nosniff) in next.config.
- Stripe webhook signature verification; idempotency keys on PaymentIntent creation.
- Rate limit: auth endpoints 10/min/IP, booking 30/min/user (simple in-memory + documented
  upgrade path to Redis/Upstash).
- Secrets only via env vars; `.env.example` documents all; never log PII/secrets; file uploads
  validated (type/size) — store in `public/uploads` for v1 with a documented S3 upgrade path.
- `npm audit` clean on deploy; dependabot config in repo.

## 11. UX / responsive / SEO
- Mobile-first Tailwind; works at 360px / 768px / 1280px; sticky mobile booking bar; accessible
  (labels, focus states, contrast, reduced-motion).
- Public pages (home, categories, city pages, listing pages) server-rendered with JSON-LD
  (Product/Offer, FAQPage, LocalBusiness) + meta descriptions — agentic-search ready, per the
  user's quality bar. Orlando category landing pages seeded from the 17-post blog taxonomy.
- Brand: deep green (#0d6b46) + warm neutrals, "Onsite Dumpsters" wordmark.

## 12. Deliverables & acceptance
- Monorepo at `~/workspace/dumpster-marketplace` (this VM), git repo, pushed to GitHub.
- `README.md` (setup, env, fee model summary), `docs/FEE_MODEL.md` (binding fee math + examples),
  `docs/STRIPE_SETUP.md` (Connect onboarding, webhook, go-live checklist), `docs/DEPLOY.md`
  (Vercel + Render Postgres), `docs/SECURITY.md`.
- Seed script (`prisma/seed.ts`) with Orlando data + demo users (admin/client/provider/fleet_owner,
  password `Demo1234!`, clearly labeled).
- `next build` passes, `tsc --noEmit` clean, basic vitest suite for fee math + state machine.
- Vercel deploy green, health check `/api/health` returns ok with DB connectivity.

## 13. Out of scope for v1 (note in README)
Real Stripe account + KYC (needs the business owner), production S3, Redis rate limiting, native
apps, multi-currency, full-text search service (use Postgres trigram), automated hauler
recruitment.
