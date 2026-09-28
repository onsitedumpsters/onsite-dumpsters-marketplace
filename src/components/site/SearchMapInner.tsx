"use client";

import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { formatCents } from "@/lib/fees";
import { cn } from "@/components/utils";
import type { MapMarker, SearchMapProps } from "./SearchMap";

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function photoIcon(marker: MapMarker): L.DivIcon {
  const inner = marker.photo
    ? `<img src="${escapeAttr(marker.photo)}" alt="" />`
    : `<span style="display:flex;width:64px;height:48px;align-items:center;justify-content:center;background:#e7e5e4;color:#a8a29e;font-weight:700;">${escapeAttr(marker.sizeLabel ?? "YD")}</span>`;
  return L.divIcon({
    className: "",
    html: `<div class="photo-marker${marker.sponsored ? " sponsored" : ""}">${inner}</div>`,
    iconSize: [70, 54],
    iconAnchor: [35, 54],
    popupAnchor: [0, -50],
  });
}

/** Re-center the map when the search point changes. */
function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [map, center, zoom]);
  return null;
}

function PopupCard({ marker, onAdClick }: { marker: MapMarker; onAdClick?: (id: string) => void }) {
  return (
    <div className="w-56">
      {marker.sponsored && (
        <span className="mb-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
          Sponsored
        </span>
      )}
      {marker.photo && (
        <img src={marker.photo} alt="" className="mb-2 h-28 w-full rounded-lg object-cover" loading="lazy" />
      )}
      {marker.detailHref ? (
        <a href={marker.detailHref} className="text-sm font-bold leading-snug text-stone-900 hover:text-emerald-800 hover:underline">
          {marker.title}
        </a>
      ) : (
        <p className="text-sm font-bold leading-snug text-stone-900">{marker.title}</p>
      )}
      <div className="mt-1 flex items-center justify-between text-xs text-stone-500">
        {marker.sizeLabel && <span className="font-semibold">{marker.sizeLabel}</span>}
        {typeof marker.rating === "number" && marker.rating > 0 && (
          <span aria-label={`Rated ${marker.rating.toFixed(1)} out of 5`}>
            ★ {marker.rating.toFixed(1)}
            {typeof marker.reviewCount === "number" ? ` (${marker.reviewCount})` : ""}
          </span>
        )}
      </div>
      {marker.providerName && <p className="mt-0.5 truncate text-xs text-stone-500">{marker.providerName}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        {typeof marker.totalCents === "number" && (
          <p className="text-base font-bold tabular-nums text-emerald-800">{formatCents(marker.totalCents)}</p>
        )}
        {marker.bookHref && (
          <a
            href={marker.bookHref}
            onClick={() => {
              if (marker.campaignId && onAdClick) onAdClick(marker.campaignId);
            }}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Book
          </a>
        )}
      </div>
    </div>
  );
}

export function SearchMapInner({
  center,
  zoom = 11,
  markers,
  radiusMiles,
  onAdClick,
  className,
  ariaLabel = "Map of available dumpster listings",
}: SearchMapProps) {
  const icons = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const marker of markers) m.set(marker.id, photoIcon(marker));
    return m;
  }, [markers]);

  return (
    <div className={cn("relative z-0 h-[340px] w-full overflow-hidden rounded-xl border border-stone-200 sm:h-[420px]", className)} role="application" aria-label={ariaLabel}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={center} zoom={zoom} />
        {typeof radiusMiles === "number" && radiusMiles > 0 && (
          <Circle
            center={center}
            radius={radiusMiles * 1609.34}
            pathOptions={{ color: "#0d6b46", weight: 2, fillColor: "#0d6b46", fillOpacity: 0.08 }}
          />
        )}
        {markers.map((marker) => (
          <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={icons.get(marker.id)}>
            <Popup>
              <PopupCard marker={marker} onAdClick={onAdClick} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
