# Fee Model — Binding Contract

Source of truth: `src/lib/fees.ts` (`calculateFees`, `quoteCancellationRefund`,
`rentalRefundFraction`, `CANCELLATION_POLICY_TEXT`). This document restates the math;
in any conflict, the code wins. Currency: USD, integer cents everywhere.

## The rules (BUILD_SPEC §3)

All fees below are **charged to the customer at checkout, kept by the platform, and
NEVER refundable** under any cancellation or refund scenario. They appear itemized at
checkout, on receipts, on order detail pages, and in the admin ledger. Amounts are
admin-configurable and versioned in the `fee_schedule` table; the defaults below are
fee-schedule v1.

| Fee | Amount | Notes |
|---|---|---|
| `booking_fee` | $19.00 flat per order | Platform revenue, non-refundable |
| `dropping_fee` | $29.00 flat per delivery | Platform revenue, non-refundable |
| `processing_fee` | 2.9% + $0.30 | Of the **pre-processing subtotal** (rental + booking + dropping). Collected as its own line item at transaction time to offset Stripe's actual deduction. Non-refundable. |
| `take_rate` | 8% of the **rental subtotal** | Platform revenue, deducted from the hauler payout, non-refundable once captured |

- `rental_subtotal` = the hauler's listed price for the job (base + included days/tons).
  **This is the ONLY escrowed portion.**
- Customer grand total = rental_subtotal + booking_fee + dropping_fee + processing_fee.
- Hauler payout = rental_subtotal − take_rate amount − any platform-paid adjustments.

## Formulas

```
processing_fee = round((rental_subtotal + booking_fee + dropping_fee) × 0.029 + 0.30)
take_rate      = round(rental_subtotal × 0.08)
grand_total    = rental_subtotal + booking_fee + dropping_fee + processing_fee
hauler_payout  = rental_subtotal − take_rate
platform_keeps = booking_fee + dropping_fee + processing_fee + take_rate   (never refunded)
```

## Worked example: $425.00 rental (20-yard roll-off)

```
rental_subtotal   =  $425.00  (42,500¢)
booking_fee       =   $19.00  ( 1,900¢)
dropping_fee      =   $29.00  ( 2,900¢)
pre-processing subtotal = 42500 + 1900 + 2900 = 47,300¢

processing_fee = round(47,300 × 0.029 + 30)
               = round(1,371.7 + 30)
               = round(1,401.7)
               = 1,402¢  →  $14.02

take_rate = round(42,500 × 0.08)
          = round(3,400)
          = 3,400¢  →  $34.00

grand_total (customer pays) = 42,500 + 1,900 + 2,900 + 1,402
                            = 48,702¢  →  $487.02

hauler_payout = 42,500 − 3,400 = 39,100¢  →  $391.00
platform_keeps = 1,900 + 2,900 + 1,402 + 3,400 = 9,602¢  →  $96.02

Check: customer 487.02 = hauler 391.00 + platform 96.02  ✓
```

## Refund table (cancellations)

Only the **rental subtotal** is ever refundable. Fees (booking, dropping, processing,
take rate on captured amounts) are **never** refunded.

| When the customer cancels | Rental refunded | Fees refunded |
|---|---|---|
| More than 48h before scheduled delivery | 100% of rental subtotal | $0 — never |
| 24–48h before scheduled delivery | 50% of rental subtotal | $0 — never |
| Less than 24h before delivery, or after dispatch | 0% | $0 — never |

Boundary behavior (tested in `src/lib/fees.test.ts`): exactly 48h → 50%;
exactly 24h → 50%; 23.99h → 0%.

Example on the $425 order above, cancelled 30h before delivery:
customer receives `round(42500 × 0.5)` = **$212.50**; the platform keeps
$19.00 + $29.00 + $14.02 = **$62.02** in fees plus the $34.00 take rate.

## The "fees never refundable" guarantee

`quoteCancellationRefund()` in `src/lib/fees.ts` structurally separates the refundable
rental portion from fees: `nonRefundableFeesCents` is always exactly
`booking + dropping + processing`, and `customerReceivesCents ≤ rentalSubtotal` in
every scenario. The test suite asserts this across the full cancellation timeline
(168h → 0h). The ledger mirrors it: cancelled orders write a `rental_refund` row
(negative = outflow to customer) while the `fee_booking` / `fee_dropping` /
`fee_processing` / `fee_take_rate` rows stay positive (retained).

The cancellation policy text shown verbatim at checkout (with a required checkbox) is
`CANCELLATION_POLICY_TEXT` in `src/lib/fees.ts`.

## Admin fee versioning

- Fee amounts live in the `fee_schedule` table (`FeeSchedule` model). Each version has
  `effectiveFrom`; exactly one row should have `isActive = true`.
- Orders snapshot their money fields at booking **and** link `feeScheduleId`, so a
  later fee change never rewrites history — old orders keep their original schedule.
- Changing fees = creating a **new** `FeeSchedule` row (increment `version`, set it
  active, deactivate the old one). Never edit an existing row that has orders.
- `DEFAULT_FEE_SCHEDULE` in `src/lib/fees.ts` mirrors v1 defaults for code paths that
  need the schedule before DB access (e.g. quote previews).
