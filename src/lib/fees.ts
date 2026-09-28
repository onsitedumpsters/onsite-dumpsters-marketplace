// Fee math for Onsite Dumpsters Marketplace — BINDING per BUILD_SPEC §3.
// Currency: USD, integer cents. All platform fees are NON-REFUNDABLE.
//
// Customer grand total = rentalSubtotal + bookingFee + droppingFee + processingFee
//   processingFee = round((rentalSubtotal + bookingFee + droppingFee) * processingPct + processingFlatCents)
//   takeRate      = round(rentalSubtotal * takeRatePct)   (deducted from hauler payout)
// Hauler payout  = rentalSubtotal − takeRate
// Platform keeps = bookingFee + droppingFee + processingFee + takeRate  (never refunded)

export interface FeeScheduleInput {
  bookingFeeCents: number;
  droppingFeeCents: number;
  processingPct: number; // e.g. 0.029
  processingFlatCents: number; // e.g. 30
  takeRatePct: number; // e.g. 0.08
  cancelFullHours: number; // e.g. 48
  cancelHalfHours: number; // e.g. 24
}

export interface FeeBreakdown {
  rentalSubtotalCents: number;
  bookingFeeCents: number;
  droppingFeeCents: number;
  processingFeeCents: number;
  takeRateCents: number;
  grandTotalCents: number;
  haulerPayoutCents: number;
  platformRevenueCents: number;
}

export const DEFAULT_FEE_SCHEDULE: FeeScheduleInput = {
  bookingFeeCents: 1900,
  droppingFeeCents: 2900,
  processingPct: 0.029,
  processingFlatCents: 30,
  takeRatePct: 0.08,
  cancelFullHours: 48,
  cancelHalfHours: 24,
};

export function calculateFees(
  rentalSubtotalCents: number,
  schedule: FeeScheduleInput = DEFAULT_FEE_SCHEDULE,
): FeeBreakdown {
  if (!Number.isInteger(rentalSubtotalCents) || rentalSubtotalCents < 0) {
    throw new Error("rentalSubtotalCents must be a non-negative integer");
  }
  const bookingFeeCents = schedule.bookingFeeCents;
  const droppingFeeCents = schedule.droppingFeeCents;
  const preProcessing = rentalSubtotalCents + bookingFeeCents + droppingFeeCents;
  const processingFeeCents = Math.round(preProcessing * schedule.processingPct + schedule.processingFlatCents);
  const takeRateCents = Math.round(rentalSubtotalCents * schedule.takeRatePct);
  const grandTotalCents = rentalSubtotalCents + bookingFeeCents + droppingFeeCents + processingFeeCents;
  const haulerPayoutCents = rentalSubtotalCents - takeRateCents;
  const platformRevenueCents = bookingFeeCents + droppingFeeCents + processingFeeCents + takeRateCents;
  return {
    rentalSubtotalCents,
    bookingFeeCents,
    droppingFeeCents,
    processingFeeCents,
    takeRateCents,
    grandTotalCents,
    haulerPayoutCents,
    platformRevenueCents,
  };
}

/** Cancellation policy: what fraction of the RENTAL SUBTOTAL is refundable.
 *  Platform fees (booking, dropping, processing, take rate) are NEVER refunded. */
export function rentalRefundFraction(
  hoursUntilDelivery: number,
  schedule: FeeScheduleInput = DEFAULT_FEE_SCHEDULE,
): 1 | 0.5 | 0 {
  if (hoursUntilDelivery > schedule.cancelFullHours) return 1;
  if (hoursUntilDelivery >= schedule.cancelHalfHours) return 0.5;
  return 0;
}

export interface RefundQuote {
  refundableRentalCents: number; // portion of rental subtotal returned to customer
  nonRefundableFeesCents: number; // booking + dropping + processing — always kept
  retainedTakeRateCents: number; // take rate on captured amounts — always kept
  customerReceivesCents: number;
  haulerPayoutAfterRefundCents: number;
}

/** Compute the refund for a cancelled order. Fees are never refunded — guaranteed. */
export function quoteCancellationRefund(
  breakdown: FeeBreakdown,
  hoursUntilDelivery: number,
  schedule: FeeScheduleInput = DEFAULT_FEE_SCHEDULE,
): RefundQuote {
  const fraction = rentalRefundFraction(hoursUntilDelivery, schedule);
  const refundableRentalCents = Math.round(breakdown.rentalSubtotalCents * fraction);
  const nonRefundableFeesCents =
    breakdown.bookingFeeCents + breakdown.droppingFeeCents + breakdown.processingFeeCents;
  const retainedTakeRateCents = breakdown.takeRateCents;
  // Hauler keeps the non-refunded rental portion minus take rate (take rate already accounted).
  const haulerPayoutAfterRefundCents = Math.max(
    0,
    breakdown.rentalSubtotalCents - refundableRentalCents - breakdown.takeRateCents,
  );
  return {
    refundableRentalCents,
    nonRefundableFeesCents,
    retainedTakeRateCents,
    customerReceivesCents: refundableRentalCents,
    haulerPayoutAfterRefundCents,
  };
}

export const CANCELLATION_POLICY_TEXT = `Cancellation policy: cancel more than 48 hours before scheduled delivery for a full refund of the rental amount; 24–48 hours before delivery for a 50% refund of the rental amount; less than 24 hours before delivery or after dispatch is non-refundable. The booking fee, drop-off fee, and payment processing fee are non-refundable under all circumstances.`;

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
