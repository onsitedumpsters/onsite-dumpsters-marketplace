"use client";

import { formatCents, CANCELLATION_POLICY_TEXT, type FeeBreakdown } from "@/lib/fees";

/** Itemized, transparent fee breakdown — reused at checkout, receipts, order detail, admin ledger. */
export function FeeBreakdownTable({ breakdown, showPolicy = false }: { breakdown: FeeBreakdown; showPolicy?: boolean }) {
  const rows: Array<[string, number, string?]> = [
    ["Rental (held until delivery)", breakdown.rentalSubtotalCents],
    ["Booking fee — platform, non-refundable", breakdown.bookingFeeCents, "Non-refundable"],
    ["Drop-off fee — platform, non-refundable", breakdown.droppingFeeCents, "Non-refundable"],
    ["Payment processing fee (Stripe) — platform, non-refundable", breakdown.processingFeeCents, "Non-refundable"],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, cents, tag]) => (
            <tr key={label} className="border-b border-stone-100 last:border-0">
              <td className="px-4 py-2.5 text-stone-700">
                {label}
                {tag && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    {tag}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCents(cents)}</td>
            </tr>
          ))}
          <tr className="bg-emerald-50/60">
            <td className="px-4 py-3 font-bold text-stone-900">Total due today</td>
            <td className="px-4 py-3 text-right text-lg font-bold tabular-nums text-emerald-900">
              {formatCents(breakdown.grandTotalCents)}
            </td>
          </tr>
        </tbody>
      </table>
      {showPolicy && (
        <p className="border-t border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-relaxed text-stone-600">
          {CANCELLATION_POLICY_TEXT}
        </p>
      )}
    </div>
  );
}
