# Onsite Dumpsters Marketplace

A production-grade, multi-sided dumpster rental marketplace: Next.js 16 (App Router) +
TypeScript + Tailwind CSS v4, Prisma ORM + PostgreSQL, Auth.js v5 (credentials + Google
OAuth), Stripe (PaymentIntents + Connect Express + webhooks), Leaflet/OpenStreetMap maps.

Launch market: **Orlando, FL**.

## Quickstart

```bash
cp .env.example .env          # then edit: set DATABASE_URL, AUTH_SECRET, Stripe keys
npx prisma migrate dev --name init   # or: npx prisma db push (no migration files)
npm run db:seed              # Orlando demo data + demo users (see below)
npm run dev                  # http://localhost:3000
```

Health check (also used by deploy monitors): `GET /api/health` → `{ status: "ok",
service: "onsite-dumpsters-marketplace", database: "ok", stripe: "configured" |
"not_configured" }`.

> **Demo payments mode:** if `STRIPE_SECRET_KEY` is unset, checkout runs in clearly-labeled
> DEMO mode — authorization/capture/release are simulated with the same fee math and ledger
> entries, so every flow is clickable end-to-end before real Stripe onboarding. Demo and
> live money are never mixed; an admin banner shows the current mode.

## Demo logins

Seeded by `npm run db:seed`. **Password for all demo users: `Demo1234!`**
(documented demo credential only — never use in production).

| Email | Role | Who |
|---|---|---|
| `admin@onsitedumpsters.example` | admin | Marketplace Owner |
| `maria.client@example.com` | client | Maria Santos (homeowner) |
| `contractor.bob@example.com` | client | Bob's Remodeling (contractor) |
| `sunshine.hauling@example.com` | provider | Sunshine Hauling Co. — approved, Orlando |
| `cfl.waste@example.com` | provider | Central FL Waste Services — approved |
| `rapid.rolloff@example.com` | provider | Rapid Roll-Offs LLC — pending verification |
| `fleet.owner@example.com` | fleet_owner | Orlando Fleet Holdings — 6 containers, 2 assigned to Sunshine Hauling |

Seeded orders cover **every** order state: `OD-2026-1001`/`1002` reviewed (with reviews,
ledger, and an overweight adjustment), `1003` delivered, `1004` in_service, `1005` booked
(escrow held), `1006` disputed, `1007` cancelled (rental refunded, fees retained).
Two active ad campaigns (sponsored search + homepage feature) with impressions, clicks,
invoices, and `ad_revenue` ledger rows are included.

## Fee model (6-line summary — binding, see `docs/FEE_MODEL.md`)

1. **Booking fee** $19.00 flat per order — platform revenue, non-refundable.
2. **Drop-off fee** $29.00 flat per delivery — platform revenue, non-refundable.
3. **Processing fee** = 2.9% + $0.30 of the pre-processing subtotal — platform revenue, non-refundable.
4. **Take rate** 8% of the rental subtotal — deducted from the hauler payout, non-refundable once captured.
5. **Rental subtotal** is the hauler's price and the ONLY escrowed portion. Customer grand total = rental + booking + drop-off + processing.
6. **Cancellations:** >48h before delivery → 100% of rental refunded; 24–48h → 50%; <24h or after dispatch → 0%. **Fees are never refunded.**

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (Prisma generate + migrate deploy run separately — see `docs/DEPLOY.md`) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | `vitest run` (fee math + order state machine) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | `prisma migrate dev` (dev) |
| `npm run db:push` | `prisma db push` (quick schema sync, dev only) |
| `npm run db:seed` | `tsx prisma/seed.ts` — re-runnable demo seed |

## Project structure

```
prisma/
  schema.prisma      # PostgreSQL schema — all money in integer cents (USD)
  seed.ts            # Orlando demo seed (re-runnable; password Demo1234!)
src/
  app/
    page.tsx                 # Homepage
    api/health/route.ts      # Health check (DB + Stripe config status)
    # (sibling tracks build: public pages, dashboards, booking/checkout,
    #  webhooks, and the remaining API routes in parallel)
  lib/
    fees.ts            # BINDING fee math: calculateFees, quoteCancellationRefund,
                       # rentalRefundFraction, CANCELLATION_POLICY_TEXT, formatCents
    order-machine.ts   # Order state machine: canTransition, mayTransition,
                       # TRANSITION_ROLES, TERMINAL_STATUSES
    ledger.ts          # recordLedger — every money movement writes a row
    cities.ts          # Launch-market geography, categories, Orlando permit rules
    db.ts              # Prisma client singleton
    stripe.ts          # Stripe client + Connect helpers
    server-auth.ts     # Auth.js server helpers
    rate-limit.ts      # In-memory rate limiting (Redis upgrade path documented)
docs/
  FEE_MODEL.md         # Binding fee math, worked example, refund table
  STRIPE_SETUP.md      # Stripe account → Connect → webhooks → go-live checklist
  DEPLOY.md            # Vercel + Render Postgres deployment
  SECURITY.md          # Security posture and upgrade paths
```

## Docs

- [`docs/FEE_MODEL.md`](docs/FEE_MODEL.md) — the binding fee contract with a worked example.
- [`docs/STRIPE_SETUP.md`](docs/STRIPE_SETUP.md) — Stripe/Connect/webhook setup and go-live checklist.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — deploying frontend (Vercel) + Postgres (Render).
- [`docs/SECURITY.md`](docs/SECURITY.md) — headers, RBAC, rate limits, uploads, audit.

## Out of scope for v1

Per the build spec: real Stripe account + KYC (needs the business owner), production S3
uploads, Redis rate limiting, native apps, multi-currency, full-text search service
(use Postgres trigram), automated hauler recruitment.
