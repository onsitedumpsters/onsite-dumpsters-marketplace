import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { calculateFees, formatCents } from "@/lib/fees";
import { Stars } from "./Stars";

export interface ListingCardData {
  id: string;
  slug: string;
  title: string;
  sizeYards?: number | null;
  categoryLabel: string;
  primaryPhoto?: string | null;
  basePriceCents: number;
  includedDays?: number;
  ratingAvg: number;
  reviewCount: number;
  providerName: string;
  sponsored?: boolean;
}

export function ListingCard({ listing }: { listing: ListingCardData }) {
  const fees = calculateFees(listing.basePriceCents);
  return (
    <Card className="group overflow-hidden p-0 transition-shadow hover:shadow-md">
      <Link
        href={`/listings/${listing.slug}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        aria-label={`${listing.title} — ${formatCents(fees.grandTotalCents)} total`}
      >
        <div className="relative aspect-[4/3] bg-stone-100">
          {listing.primaryPhoto ? (
            <img
              src={listing.primaryPhoto}
              alt={listing.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-stone-300" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor">
                <path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm1 2v10h14V7H5zm2 2h10v2H7V9zm0 4h7v2H7v-2z" />
              </svg>
            </div>
          )}
          {listing.sponsored && (
            <span className="absolute left-2 top-2">
              <Badge tone="amber">Sponsored</Badge>
            </span>
          )}
          {listing.sizeYards ? (
            <span className="absolute right-2 top-2">
              <Badge tone="green">{listing.sizeYards} yd</Badge>
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {listing.categoryLabel}
          </p>
          <h3 className="mt-1 line-clamp-2 text-base font-bold text-stone-900">{listing.title}</h3>
          <div className="mt-1.5 flex items-center gap-2">
            <Stars value={listing.ratingAvg} count={listing.reviewCount} />
            <span className="truncate text-xs text-stone-500">{listing.providerName}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-stone-100 pt-3">
            <div>
              <p className="text-lg font-bold tabular-nums text-stone-900">
                {formatCents(fees.grandTotalCents)}
              </p>
              <p className="text-xs text-stone-500">
                total · incl. all fees{listing.includedDays ? ` · ${listing.includedDays} days` : ""}
              </p>
            </div>
            <span className="text-xs font-medium tabular-nums text-stone-400">
              {formatCents(listing.basePriceCents)} rental
            </span>
          </div>
        </div>
      </Link>
    </Card>
  );
}
