// Tests for the binding fee model (BUILD_SPEC §3, src/lib/fees.ts).
// All money in integer cents (USD). Fees are NEVER refundable.
import { describe, it, expect } from "vitest";
import {
  calculateFees,
  quoteCancellationRefund,
  rentalRefundFraction,
  DEFAULT_FEE_SCHEDULE,
} from "./fees";

describe("calculateFees", () => {
  it("computes the exact binding breakdown for a $400.00 rental", () => {
    const b = calculateFees(40000, DEFAULT_FEE_SCHEDULE);
    expect(b.rentalSubtotalCents).toBe(40000);
    expect(b.bookingFeeCents).toBe(1900);
    expect(b.droppingFeeCents).toBe(2900);
    // processing = round((40000 + 1900 + 2900) * 0.029 + 30) = round(1329.2) = 1329
    expect(b.processingFeeCents).toBe(1329);
    // take rate = round(40000 * 0.08) = 3200
    expect(b.takeRateCents).toBe(3200);
    expect(b.grandTotalCents).toBe(46129);
    expect(b.haulerPayoutCents).toBe(36800);
    expect(b.platformRevenueCents).toBe(9329);
  });

  it("keeps the ledger balanced: grandTotal = rental + all customer-facing fees", () => {
    const b = calculateFees(42500);
    expect(b.grandTotalCents).toBe(
      b.rentalSubtotalCents + b.bookingFeeCents + b.droppingFeeCents + b.processingFeeCents,
    );
    expect(b.haulerPayoutCents).toBe(b.rentalSubtotalCents - b.takeRateCents);
    expect(b.platformRevenueCents).toBe(
      b.bookingFeeCents + b.droppingFeeCents + b.processingFeeCents + b.takeRateCents,
    );
  });

  it("handles a zero rental subtotal (fees still apply)", () => {
    const b = calculateFees(0);
    expect(b.bookingFeeCents).toBe(1900);
    expect(b.droppingFeeCents).toBe(2900);
    // processing = round((0 + 1900 + 2900) * 0.029 + 30) = round(169.2) = 169
    expect(b.processingFeeCents).toBe(169);
    expect(b.takeRateCents).toBe(0);
    expect(b.grandTotalCents).toBe(1900 + 2900 + 169);
    expect(b.haulerPayoutCents).toBe(0);
    expect(b.platformRevenueCents).toBe(1900 + 2900 + 169);
  });

  it("throws on invalid input", () => {
    expect(() => calculateFees(-1)).toThrow();
    expect(() => calculateFees(-100)).toThrow();
    expect(() => calculateFees(10.5)).toThrow("non-negative integer");
    expect(() => calculateFees(NaN)).toThrow("non-negative integer");
  });
});

describe("rentalRefundFraction", () => {
  it("applies the binding boundary rules", () => {
    expect(rentalRefundFraction(48.01)).toBe(1); // >48h → full
    expect(rentalRefundFraction(48)).toBe(0.5); // exactly 48h → half
    expect(rentalRefundFraction(24)).toBe(0.5); // exactly 24h → half
    expect(rentalRefundFraction(23.99)).toBe(0); // <24h → nothing
    expect(rentalRefundFraction(0)).toBe(0);
    expect(rentalRefundFraction(100)).toBe(1);
  });
});

describe("quoteCancellationRefund", () => {
  const b = calculateFees(40000); // fees total 1900 + 2900 + 1329 = 6129; take rate 3200

  it(">48h: full rental refunded, customer receives exactly the rental subtotal", () => {
    const q = quoteCancellationRefund(b, 72);
    expect(q.refundableRentalCents).toBe(40000);
    expect(q.customerReceivesCents).toBe(b.rentalSubtotalCents);
    expect(q.nonRefundableFeesCents).toBe(1900 + 2900 + 1329);
  });

  it("24–48h: half the rental refunded, fees excluded", () => {
    const q = quoteCancellationRefund(b, 30);
    expect(q.refundableRentalCents).toBe(20000);
    expect(q.customerReceivesCents).toBe(20000);
    expect(q.nonRefundableFeesCents).toBe(6129);
  });

  it("<24h: zero refunded, customer receives 0", () => {
    const q = quoteCancellationRefund(b, 5);
    expect(q.refundableRentalCents).toBe(0);
    expect(q.customerReceivesCents).toBe(0);
    expect(q.nonRefundableFeesCents).toBe(6129);
  });

  it("fees are NEVER refunded in any cancellation scenario", () => {
    for (const hours of [168, 72, 48.01, 48, 36, 24, 23.99, 12, 1, 0]) {
      const q = quoteCancellationRefund(b, hours);
      // Non-refundable fees are exactly booking + dropping + processing…
      expect(q.nonRefundableFeesCents).toBe(
        b.bookingFeeCents + b.droppingFeeCents + b.processingFeeCents,
      );
      // …and the customer can never receive more than the rental subtotal.
      expect(q.customerReceivesCents).toBeLessThanOrEqual(b.rentalSubtotalCents);
      // Take rate on captured amounts is retained by the platform.
      expect(q.retainedTakeRateCents).toBe(b.takeRateCents);
    }
  });

  it("rounds half refunds to whole cents", () => {
    const odd = calculateFees(39999);
    const q = quoteCancellationRefund(odd, 30);
    expect(q.refundableRentalCents).toBe(Math.round(39999 * 0.5));
    expect(Number.isInteger(q.refundableRentalCents)).toBe(true);
  });
});
