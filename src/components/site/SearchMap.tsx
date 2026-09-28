"use client";

import dynamic from "next/dynamic";

/** One result pin on the map. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  photo?: string | null;
  title: string;
  sizeLabel?: string;
  totalCents?: number;
  rating?: number;
  reviewCount?: number;
  providerName?: string;
  detailHref?: string;
  bookHref?: string;
  sponsored?: boolean;
  campaignId?: string | null;
}

export interface SearchMapProps {
  center: [number, number];
  zoom?: number;
  markers: MapMarker[];
  /** Draw a service-area circle around the center (miles). */
  radiusMiles?: number;
  /** Called for sponsored markers: record an ad click when the user taps "Book". */
  onAdClick?: (campaignId: string) => void;
  className?: string;
  ariaLabel?: string;
}

const SearchMapInner = dynamic(
  () => import("./SearchMapInner").then((m) => m.SearchMapInner),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-full min-h-[320px] items-center justify-center bg-stone-100 text-sm text-stone-500"
        role="status"
        aria-label="Loading map"
      >
        Loading map…
      </div>
    ),
  },
);

/** Leaflet map wrapper — the inner map is dynamically imported with ssr:false. */
export function SearchMap(props: SearchMapProps) {
  return <SearchMapInner {...props} />;
}
