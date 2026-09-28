// Ledger writer — every money movement MUST write a row (BUILD_SPEC §4/§10).
import { db } from "./db";
import type { LedgerType } from "@prisma/client";

interface LedgerInput {
  orderId?: string;
  adInvoiceId?: string;
  type: LedgerType;
  amountCents: number; // signed
  stripeRef?: string;
  description: string;
  idempotencyKey?: string;
}

export async function recordLedger(input: LedgerInput) {
  const data = {
    orderId: input.orderId,
    adInvoiceId: input.adInvoiceId,
    type: input.type,
    amountCents: input.amountCents,
    stripeRef: input.stripeRef,
    description: input.description,
    idempotencyKey:
      input.idempotencyKey ??
      `${input.type}:${input.orderId ?? input.adInvoiceId ?? "na"}:${Date.now()}`,
  };
  // Upsert on the idempotency key: concurrent duplicate calls (double-clicks,
  // webhook redelivery racing a user action) collapse to a single row instead
  // of throwing a unique-constraint violation.
  if (input.idempotencyKey) {
    return db.ledgerEntry.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: data,
    });
  }
  return db.ledgerEntry.create({ data });
}

/** Sum of platform revenue (fee rows) for an order. */
export async function platformRevenueForOrder(orderId: string): Promise<number> {
  const rows = await db.ledgerEntry.aggregate({
    where: {
      orderId,
      type: { in: ["fee_booking", "fee_dropping", "fee_processing", "fee_take_rate"] },
    },
    _sum: { amountCents: true },
  });
  return rows._sum.amountCents ?? 0;
}
