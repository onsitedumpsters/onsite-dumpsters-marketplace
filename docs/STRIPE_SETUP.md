# Stripe Setup

This marketplace uses **Stripe PaymentIntents** (manual capture = escrow) +
**Stripe Connect Express** (provider/fleet-owner payouts) + **signature-verified
webhooks**. Until the keys below are set, the app runs in clearly-labeled DEMO mode
(see README) — no real money moves.

> Real Stripe account + KYC is **out of scope for v1** and needs the business owner.
> Everything below through “Connect onboarding test flow” can be done with free test keys.

## 1. Create the Stripe account

1. Go to [stripe.com](https://stripe.com) → **Start now** → create the business account
   for **Onsite Dumpsters**.
2. In the Dashboard, confirm you are in **Test mode** (toggle, top-right) while building.

## 2. API keys → `.env`

1. Dashboard → **Developers** → **API keys**.
2. Copy the **test** keys into `.env` (see `.env.example`):
   - `STRIPE_SECRET_KEY` ← “Secret key” (`sk_test_…`)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` ← “Publishable key” (`pk_test_…`)
3. Restart `npm run dev`. `GET /api/health` should now report `"stripe": "configured"`.

## 3. Connect (Express) for provider payouts

1. Dashboard → **Settings** → **Connect** → **Settings**.
2. Under “Integration”, choose **Express** as the account type.
3. Set the onboarding redirect URLs to your app:
   - Refresh URL: `https://<app>/api/connect/refresh`
   - Return URL: `https://<app>/provider/payouts`
   (For local dev: `http://localhost:3000/api/connect/refresh` and
   `http://localhost:3000/provider/payouts`.)
4. The app creates the Express onboarding link per provider; the `account.updated`
   webhook (below) gates payouts on `charges_enabled` / `payouts_enabled`.

> **Route check (2026-09-28):** `/api/connect/*` and `/provider/payouts` are **intended
> paths not yet present in the tree** (only `/api/health` and `/` exist so far — sibling
> tracks build them in parallel). Update these URLs if the final route names differ.

## 4. Webhook endpoint

**Production / staging (Vercel):**

1. Dashboard → **Developers** → **Webhooks** → **Add endpoint**.
2. Endpoint URL: `https://<app>/api/webhooks/stripe`
   (Intended path — verify the route exists before going live; see note above.)
3. **Events to send** — subscribe to exactly these:
   - `payment_intent.amount_capturable_updated`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `account.updated`
   - `checkout.session.completed`
4. Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET` in `.env`
   (production env vars in Vercel, never in git).

**Local development:**

```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Use the `whsec_…` secret printed by `stripe listen` as `STRIPE_WEBHOOK_SECRET` locally.

## 5. Payment flow mapping (how the app uses Stripe)

| Step | Stripe action |
|---|---|
| Booking | Create PaymentIntent for the **grand total** with `capture_method: "manual"` (authorize only = escrow), `application_fee_amount` = booking+dropping+processing+take_rate (cents), `transfer_data.destination` = provider's Connect account, `transfer_group` = order id. Idempotency key on creation. |
| Delivery confirmed | Capture the PaymentIntent (minus any pre-delivery cancellation). |
| Pickup completed | Order → completed; payout transfer settles to the provider per Connect schedule. |
| Adjustments (overweight, extra days) | Separate PaymentIntent on the saved payment method, itemized, evidence-attached. |
| Ads (Promote module) | Stripe Checkout one-time payment; platform keeps 100%, non-refundable. |

Every money movement writes a `LedgerEntry` row (see `src/lib/ledger.ts`); webhook
handlers are idempotent.

## 6. Test cards & Connect onboarding test flow

- Test card: **4242 4242 4242 4242**, any future expiry, any CVC/ZIP.
- Decline test: **4000 0000 0000 0002** (drives `payment_intent.payment_failed`).
- Booking test: book as `maria.client@example.com` (seeded, password `Demo1234!`) →
  authorize the grand total → confirm the `charge_authorized` ledger row and escrow
  status `held`.
- Connect test: as a seeded provider, start onboarding → use Stripe's test identity
  (`000000000` SSN / test documents when prompted) → complete → verify
  `account.updated` flips `connectChargesEnabled` and payouts unblock.

## 7. Go-live checklist

- [ ] Business verification + KYC completed by the business owner; **Live mode** enabled.
- [ ] Live keys (`sk_live_…`, `pk_live_…`) set in Vercel env vars — test keys removed.
- [ ] Production webhook endpoint `https://<app>/api/webhooks/stripe` created with the
      six events above; **webhook secret rotated** (new `whsec_…` from the live endpoint
      → Vercel env var; old test secret discarded).
- [ ] `stripe listen` no longer in use; local dev uses test keys only.
- [ ] Connect set to **Express** in live mode; onboarding return/refresh URLs point at
      the production domain.
- [ ] One live-mode test booking with a real card for a small amount, then refunded —
      verify ledger rows, escrow release, and provider payout in the Dashboard.
- [ ] `GET /api/health` on production returns `status: "ok"`, `database: "ok"`,
      `stripe: "configured"`.
- [ ] Confirm DEMO-mode banner is **off** in production (it keys off the presence of
      `STRIPE_SECRET_KEY`).
