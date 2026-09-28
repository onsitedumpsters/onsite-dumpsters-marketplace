import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DEFAULT_FEE_SCHEDULE, type FeeScheduleInput } from "@/lib/fees";
import { BookForm } from "./BookForm";
import { PageHeader } from "@/components/ui";

export default async function BookPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      status: true,
      title: true,
      category: true,
      sizeYards: true,
      basePriceCents: true,
      includedDays: true,
      includedTons: true,
      materialsProhibited: true,
      provider: {
        select: {
          name: true,
          providerProfile: { select: { businessName: true } },
        },
      },
    },
  });
  if (!listing || listing.status !== "active") notFound();

  const feeSchedule = await db.feeSchedule.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  const schedule: FeeScheduleInput = feeSchedule
    ? {
        bookingFeeCents: feeSchedule.bookingFeeCents,
        droppingFeeCents: feeSchedule.droppingFeeCents,
        processingPct: feeSchedule.processingPct,
        processingFlatCents: feeSchedule.processingFlatCents,
        takeRatePct: feeSchedule.takeRatePct,
        cancelFullHours: feeSchedule.cancelFullHours,
        cancelHalfHours: feeSchedule.cancelHalfHours,
      }
    : DEFAULT_FEE_SCHEDULE;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Book this dumpster" subtitle={listing.title} />
      <BookForm
        listing={{
          id: listing.id,
          title: listing.title,
          category: listing.category,
          sizeYards: listing.sizeYards,
          basePriceCents: listing.basePriceCents,
          includedDays: listing.includedDays,
          includedTons: listing.includedTons,
          materialsProhibited: listing.materialsProhibited,
          providerName:
            listing.provider.providerProfile?.businessName ?? listing.provider.name ?? "Hauler",
        }}
        schedule={schedule}
      />
    </main>
  );
}
