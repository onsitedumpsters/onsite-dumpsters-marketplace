"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, LAUNCH_CITY } from "@/lib/cities";
import { calculateFees, formatCents } from "@/lib/fees";
import { Alert, Badge, Button, EmptyState, Field, Input, Select, Spinner } from "@/components/ui";
import { ListingCard, type ListingCardData } from "@/components/site/ListingCard";
import { SearchMap, type MapMarker } from "@/components/site/SearchMap";

interface SearchResultItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  categoryLabel: string;
  sizeYards: number | null;
  primaryPhoto: string | null;
  basePriceCents: number;
  includedDays: number;
  totalCents: number;
  ratingAvg: number;
  reviewCount: number;
  providerName: string;
  serviceLat: number | null;
  serviceLng: number | null;
  campaignId?: string | null;
}

interface SearchResponse {
  results: SearchResultItem[];
  sponsored: SearchResultItem[];
  center: [number, number];
}

const SIZES = [10, 15, 20, 30, 40];

function toCard(item: SearchResultItem, sponsored = false): ListingCardData {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    sizeYards: item.sizeYards,
    categoryLabel: item.categoryLabel,
    primaryPhoto: item.primaryPhoto,
    basePriceCents: item.basePriceCents,
    includedDays: item.includedDays,
    ratingAvg: item.ratingAvg,
    reviewCount: item.reviewCount,
    providerName: item.providerName,
    sponsored,
  };
}

function postAdEvent(campaignId: string, type: "impression" | "click") {
  fetch("/api/ads/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campaignId, type }),
  }).catch(() => {
    /* ad telemetry is best-effort */
  });
}

export function SearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [location, setLocation] = useState(searchParams.get("zip") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [sizeYards, setSizeYards] = useState(searchParams.get("sizeYards") ?? "");
  const [maxTotal, setMaxTotal] = useState(searchParams.get("maxTotal") ?? "");
  const [date, setDate] = useState(searchParams.get("date") ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [sponsored, setSponsored] = useState<SearchResultItem[]>([]);
  const [center, setCenter] = useState<[number, number]>([LAUNCH_CITY.lat, LAUNCH_CITY.lng]);
  const [searched, setSearched] = useState(false);
  const impressionsSent = useRef<Set<string>>(new Set());

  const runSearch = useCallback(
    async (overrides?: { location?: string; category?: string; sizeYards?: string; maxTotal?: string; date?: string }) => {
      const loc = (overrides?.location ?? location).trim();
      const cat = overrides?.category ?? category;
      const size = overrides?.sizeYards ?? sizeYards;
      const max = overrides?.maxTotal ?? maxTotal;
      const d = overrides?.date ?? date;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (/^\d{5}$/.test(loc)) {
          params.set("zip", loc);
        } else if (loc.length > 0) {
          // Geocode free-form addresses via Nominatim (client-side, per spec §6).
          const geo = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(`${loc}, Orlando, FL`)}`,
            { headers: { Accept: "application/json" } },
          );
          if (!geo.ok) throw new Error("Address lookup failed. Try a ZIP code instead.");
          const hits = (await geo.json()) as Array<{ lat: string; lon: string }>;
          if (hits.length === 0) throw new Error("Couldn't find that address. Try a ZIP code instead.");
          params.set("lat", hits[0].lat);
          params.set("lng", hits[0].lon);
        }
        if (cat) params.set("category", cat);
        if (size) params.set("sizeYards", size);
        if (max) {
          const dollars = Number(max);
          if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("Max total price must be a positive number.");
          params.set("maxTotalCents", String(Math.round(dollars * 100)));
        }
        if (d) params.set("date", d);

        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Search failed. Please try again.");
        }
        const data = (await res.json()) as SearchResponse;
        setResults(data.results);
        setSponsored(data.sponsored);
        setCenter(data.center);
        setSearched(true);

        // Record one impression per sponsored campaign (best-effort).
        for (const s of data.sponsored) {
          if (s.campaignId && !impressionsSent.current.has(s.campaignId)) {
            impressionsSent.current.add(s.campaignId);
            postAdEvent(s.campaignId, "impression");
          }
        }

        // Reflect filters in the URL so results are shareable.
        const url = new URLSearchParams();
        if (loc) url.set("zip", loc);
        if (cat) url.set("category", cat);
        if (size) url.set("sizeYards", size);
        if (max) url.set("maxTotal", max);
        if (d) url.set("date", d);
        router.replace(`/search?${url.toString()}`, { scroll: false });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [location, category, sizeYards, maxTotal, date, router],
  );

  // Auto-run once on mount when the URL already carries search params.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (searchParams.get("zip") || searchParams.get("lat") || searchParams.get("category")) {
      void runSearch();
    }
  }, [runSearch, searchParams]);

  const markers: MapMarker[] = [...sponsored, ...results]
    .filter((r) => r.serviceLat != null && r.serviceLng != null)
    .map((r) => ({
      id: r.id,
      lat: r.serviceLat as number,
      lng: r.serviceLng as number,
      photo: r.primaryPhoto,
      title: r.title,
      sizeLabel: r.sizeYards ? `${r.sizeYards} yd` : r.categoryLabel,
      totalCents: r.totalCents,
      rating: r.ratingAvg,
      reviewCount: r.reviewCount,
      providerName: r.providerName,
      detailHref: `/listings/${r.slug}`,
      bookHref: `/book/${r.id}`,
      sponsored: Boolean(r.campaignId),
      campaignId: r.campaignId ?? null,
    }));

  const handleAdClick = useCallback((campaignId: string) => {
    postAdEvent(campaignId, "click");
  }, []);

  return (
    <>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Search dumpster rentals
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Every price below is a total price — rental + $19 booking fee + $29 drop-off fee + 2.9% + $0.30 processing, itemized before you pay.
        </p>

        {/* Filters */}
        <form
          className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          aria-label="Search filters"
        >
          <div className="col-span-2 sm:col-span-1">
            <Field label="ZIP or address" htmlFor="f-location">
              <Input
                id="f-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="32801"
                inputMode="text"
                autoComplete="postal-code"
              />
            </Field>
          </div>
          <Field label="Type" htmlFor="f-category">
            <Select id="f-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All types</option>
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Size" htmlFor="f-size">
            <Select id="f-size" value={sizeYards} onChange={(e) => setSizeYards(e.target.value)}>
              <option value="">Any size</option>
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} yard
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Max total ($)" htmlFor="f-max">
            <Input
              id="f-max"
              value={maxTotal}
              onChange={(e) => setMaxTotal(e.target.value)}
              placeholder="500"
              inputMode="decimal"
            />
          </Field>
          <Field label="Delivery date" htmlFor="f-date">
            <Input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </Button>
          </div>
        </form>

        {error && (
          <div className="mt-4">
            <Alert tone="red">{error}</Alert>
          </div>
        )}

        {loading && <Spinner label="Searching haulers…" />}

        {!loading && searched && (
          <>
            <div className="mt-6">
              <SearchMap
                center={center}
                markers={markers}
                onAdClick={handleAdClick}
                ariaLabel="Map of dumpster listings near your search"
              />
            </div>

            {sponsored.length > 0 && (
              <section className="mt-8" aria-labelledby="sponsored-heading">
                <div className="mb-3 flex items-center gap-2">
                  <h2 id="sponsored-heading" className="text-lg font-bold text-stone-900">
                    Sponsored
                  </h2>
                  <Badge tone="amber">Ad</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sponsored.map((s) => (
                    <ListingCard key={s.id} listing={toCard(s, true)} />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-8" aria-labelledby="results-heading">
              <h2 id="results-heading" className="mb-3 text-lg font-bold text-stone-900">
                {results.length} result{results.length === 1 ? "" : "s"}
                {sponsored.length > 0 ? " · sponsored listings shown separately above" : ""}
              </h2>
              {results.length === 0 ? (
                <EmptyState
                  title="No dumpsters found for those filters"
                  body="Try widening the search area, removing the max-price cap, or picking a different size."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCategory("");
                        setSizeYards("");
                        setMaxTotal("");
                        setDate("");
                        void runSearch({ category: "", sizeYards: "", maxTotal: "", date: "" });
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {results.map((r) => (
                    <ListingCard key={r.id} listing={toCard(r)} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {!loading && !searched && (
          <div className="mt-6">
            <EmptyState
              title="Find your dumpster"
              body="Enter a ZIP code or address above, pick a type and size, and compare total prices from verified Orlando haulers."
            />
          </div>
        )}

        {/* Fee reminder */}
        <section className="mt-10 rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-600" aria-label="How pricing works">
          <h2 className="font-bold text-stone-900">How the total price is built</h2>
          <p className="mt-2 leading-relaxed">
            Total = rental subtotal + <strong>$19</strong> booking fee + <strong>$29</strong> drop-off
            fee + <strong>2.9% + $0.30</strong> payment processing fee (Stripe). The rental amount is
            held until delivery is confirmed; the booking, drop-off, and processing fees are platform
            fees and are <strong>non-refundable</strong>. Example: a {formatCents(34900)} rental totals{" "}
            {formatCents(calculateFees(34900).grandTotalCents)}.
          </p>
        </section>
    </>
  );
}
