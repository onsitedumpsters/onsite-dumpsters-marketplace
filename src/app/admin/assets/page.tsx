"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

interface AssetRow {
  id: string;
  photos: string[];
  rightsStatus: string;
}

interface ContainerRow extends AssetRow {
  assetTag: string | null;
  sizeYards: number;
  containerType: string;
  fleetOwner: { name: string | null };
}

interface ListingRow extends AssetRow {
  slug: string;
  title: string;
  provider: { name: string | null };
}

interface AssetsResponse {
  containers: ContainerRow[];
  listings: ListingRow[];
  summary: {
    containers: number;
    containerPlaceholders: number;
    listings: number;
    listingPlaceholders: number;
  };
}

function RightsBadge({ status }: { status: string }) {
  const placeholder = /placeholder/i.test(status);
  return (
    <Badge tone={placeholder ? "amber" : "green"}>
      {placeholder ? "Placeholder — replace with owned photography" : status}
    </Badge>
  );
}

function AssetCard({
  title,
  sub,
  link,
  photos,
  rightsStatus,
}: {
  title: string;
  sub: string;
  link: string;
  photos: string[];
  rightsStatus: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={link} className="font-bold text-emerald-700 hover:underline">
            {title}
          </Link>
          <p className="text-xs text-stone-500">{sub}</p>
        </div>
        <RightsBadge status={rightsStatus} />
      </div>
      {photos.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={u}
                alt=""
                className="h-16 w-16 rounded-lg border border-stone-200 object-cover"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone-400">No photos uploaded.</p>
      )}
    </Card>
  );
}

export default function AdminAssetsPage() {
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/assets")
      .then((r) => r.json())
      .then((d: AssetsResponse | { error: string }) =>
        "containers" in d ? setData(d) : setError(d.error ?? "Failed to load")
      )
      .catch(() => setError("Failed to load asset register"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Asset register"
        subtitle="Every image on the marketplace and its rights status. Placeholders must be replaced with owned photography before public launch."
      />
      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <p className="text-xs font-semibold uppercase text-stone-500">Containers</p>
              <p className="mt-1 text-2xl font-black text-stone-900">{data.summary.containers}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-stone-500">Container placeholders</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{data.summary.containerPlaceholders}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-stone-500">Listings</p>
              <p className="mt-1 text-2xl font-black text-stone-900">{data.summary.listings}</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-stone-500">Listing placeholders</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{data.summary.listingPlaceholders}</p>
            </Card>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-bold text-stone-900">Fleet containers</h2>
            {data.containers.length === 0 ? (
              <EmptyState title="No containers" body="No fleet containers registered yet." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {data.containers.map((c) => (
                  <AssetCard
                    key={c.id}
                    title={`${c.assetTag ?? c.id.slice(0, 8)} — ${c.sizeYards} yd ${c.containerType.replace(/_/g, " ")}`}
                    sub={`Owner: ${c.fleetOwner.name ?? "—"}`}
                    link={`/dashboard/fleet/containers/${c.id}`}
                    photos={c.photos}
                    rightsStatus={c.rightsStatus}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-stone-900">Provider listings</h2>
            {data.listings.length === 0 ? (
              <EmptyState title="No listings" body="No provider listings yet." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {data.listings.map((l) => (
                  <AssetCard
                    key={l.id}
                    title={l.title}
                    sub={`Provider: ${l.provider.name ?? "—"}`}
                    link={`/listings/${l.slug}`}
                    photos={l.photos}
                    rightsStatus={l.rightsStatus}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
