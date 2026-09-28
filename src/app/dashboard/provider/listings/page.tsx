"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/cities";
import {
  PageHeader,
  Card,
  Button,
  Alert,
  Spinner,
  Input,
  Textarea,
  Select,
  Field,
  Badge,
} from "@/components/ui";
import { DataTable } from "@/components/dash/DataTable";
import { formatCents } from "@/lib/fees";

const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

interface ListingRow {
  id: string;
  title: string;
  category: string;
  sizeYards: number | null;
  basePriceCents: number;
  status: "draft" | "active" | "paused";
  ratingAvg: number;
  reviewCount: number;
  bookingCount: number;
}

const STATUS_TONE = { draft: "neutral", active: "green", paused: "amber" } as const;

async function uploadFiles(files: FileList): Promise<string[]> {
  const urls: string[] = [];
  for (const file of Array.from(files)) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Photo upload failed");
    urls.push(json.url);
  }
  return urls;
}

export default function ProviderListingsPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // New-listing form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("roll_off_20");
  const [sizeYards, setSizeYards] = useState("20");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/provider/listings");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load listings");
      setListings(json.listings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load listings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePhotoSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls = await uploadFiles(files);
      setPhotos((p) => [...p, ...urls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/provider/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          sizeYards: sizeYards ? Number(sizeYards) : null,
          description,
          basePriceCents: Math.round(Number(basePrice) * 100),
          photos,
          primaryPhoto: photos[0] ?? null,
          status: "draft",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create listing");
      setTitle(""); setDescription(""); setBasePrice("");
      setPhotos([]);
      setShowNew(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create listing");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this listing? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/provider/listings/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not delete");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div>
      <PageHeader
        title="Listings"
        subtitle="Sizes, rate cards, service areas, and photos."
        action={
          <Button onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Close" : "New listing"}
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}

      {showNew && (
        <Card className="mb-6">
          <h2 className="mb-4 font-bold text-stone-900">New listing</h2>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Title" htmlFor="nl-title">
                <Input id="nl-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="20-Yard Roll-Off — Orlando Metro" maxLength={120} />
              </Field>
            </div>
            <Field label="Category" htmlFor="nl-category">
              <Select id="nl-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_CODES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Size (yards)" htmlFor="nl-size">
              <Input id="nl-size" type="number" min={1} max={100} value={sizeYards} onChange={(e) => setSizeYards(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="nl-desc">
                <Textarea id="nl-desc" rows={3} required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's included, delivery terms, materials…" maxLength={5000} />
              </Field>
            </div>
            <Field label="Base price (USD)" htmlFor="nl-price" hint="Rental subtotal for a standard job">
              <Input id="nl-price" type="number" step="0.01" min={0} required value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="349.00" />
            </Field>
            <div>
              <Field label="Photos" htmlFor="nl-photos" hint="JPEG/PNG/WebP, ≤5MB each">
                <Input id="nl-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => handlePhotoSelect(e.target.files)} disabled={uploading} />
              </Field>
              {photos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {photos.map((u) => (
                    <div key={u} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="Listing photo" className="h-16 w-16 rounded-lg border border-stone-200 object-cover" />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        className="absolute -right-2 -top-2 rounded-full bg-red-700 px-1.5 text-xs font-bold text-white"
                        onClick={() => setPhotos((p) => p.filter((x) => x !== u))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy || uploading}>
                {busy ? "Creating…" : "Create listing"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner label="Loading listings…" />
      ) : (
        <DataTable<ListingRow>
          data={listings}
          rowKey={(r) => r.id}
          emptyTitle="No listings yet"
          emptyBody="Create your first listing to start receiving bookings."
          columns={[
            {
              header: "Listing",
              render: (r) => (
                <span>
                  <Link href={`/dashboard/provider/listings/${r.id}`} className="font-semibold text-emerald-800 hover:underline">
                    {r.title}
                  </Link>
                  <span className="block text-xs text-stone-500">
                    {r.category.replace(/_/g, " ")}{r.sizeYards ? ` · ${r.sizeYards} yd` : ""} · ★ {r.ratingAvg.toFixed(1)} ({r.reviewCount})
                  </span>
                </span>
              ),
            },
            {
              header: "Base price",
              className: "text-right",
              render: (r) => <span className="tabular-nums">{formatCents(r.basePriceCents)}</span>,
            },
            { header: "Bookings", render: (r) => <span className="tabular-nums">{r.bookingCount}</span> },
            { header: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
            {
              header: "",
              className: "text-right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <Link href={`/dashboard/provider/listings/${r.id}`}>
                    <Button size="sm" variant="outline">Edit</Button>
                  </Link>
                  <Button size="sm" variant="danger" onClick={() => remove(r.id)}>Delete</Button>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
