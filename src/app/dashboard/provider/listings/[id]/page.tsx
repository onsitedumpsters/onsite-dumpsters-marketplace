"use client";

import { use, useCallback, useEffect, useState } from "react";
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
} from "@/components/ui";

const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

interface Listing {
  id: string;
  title: string;
  category: string;
  sizeYards: number | null;
  description: string;
  basePriceCents: number;
  includedDays: number;
  includedTons: number;
  overagePerTonCents: number;
  extraDayCents: number;
  materialsAccepted: string[];
  materialsProhibited: string[];
  serviceLat: number | null;
  serviceLng: number | null;
  serviceRadiusMiles: number;
  serviceZips: string[];
  photos: string[];
  status: "draft" | "active" | "paused";
}

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

export default function ListingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [listing, setListing] = useState<Listing | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/provider/listings/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load listing");
      const l: Listing = json.listing;
      setListing(l);
      setPhotos(l.photos ?? []);
      setF({
        title: l.title,
        category: l.category,
        sizeYards: l.sizeYards != null ? String(l.sizeYards) : "",
        description: l.description,
        basePrice: (l.basePriceCents / 100).toFixed(2),
        includedDays: String(l.includedDays),
        includedTons: String(l.includedTons),
        overagePerTon: (l.overagePerTonCents / 100).toFixed(2),
        extraDay: (l.extraDayCents / 100).toFixed(2),
        materialsAccepted: (l.materialsAccepted ?? []).join(", "),
        materialsProhibited: (l.materialsProhibited ?? []).join(", "),
        serviceLat: l.serviceLat != null ? String(l.serviceLat) : "",
        serviceLng: l.serviceLng != null ? String(l.serviceLng) : "",
        serviceRadiusMiles: String(l.serviceRadiusMiles),
        serviceZips: (l.serviceZips ?? []).join(", "),
        status: l.status,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load listing");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends string>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

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

  const splitList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/provider/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title,
          category: f.category,
          sizeYards: f.sizeYards ? Number(f.sizeYards) : null,
          description: f.description,
          basePriceCents: Math.round(Number(f.basePrice) * 100),
          includedDays: Number(f.includedDays),
          includedTons: Number(f.includedTons),
          overagePerTonCents: Math.round(Number(f.overagePerTon) * 100),
          extraDayCents: Math.round(Number(f.extraDay) * 100),
          materialsAccepted: splitList(f.materialsAccepted),
          materialsProhibited: splitList(f.materialsProhibited),
          serviceLat: f.serviceLat ? Number(f.serviceLat) : null,
          serviceLng: f.serviceLng ? Number(f.serviceLng) : null,
          serviceRadiusMiles: Number(f.serviceRadiusMiles),
          serviceZips: splitList(f.serviceZips),
          photos,
          primaryPhoto: photos[0] ?? null,
          status: f.status,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save listing");
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save listing");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading listing…" />;
  if (error && !listing) {
    return (
      <div>
        <PageHeader title="Edit listing" />
        <Alert tone="red">{error}</Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Edit listing"
        subtitle={listing?.title}
        action={
          <Link href="/dashboard/provider/listings" className="text-sm font-semibold text-emerald-800 hover:underline">
            ← All listings
          </Link>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
      {saved && (
        <div className="mb-4">
          <Alert tone="green">Listing saved.</Alert>
        </div>
      )}
      <Card>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" htmlFor="le-title">
              <Input id="le-title" required value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} maxLength={120} />
            </Field>
          </div>
          <Field label="Category" htmlFor="le-category">
            <Select id="le-category" value={f.category ?? ""} onChange={(e) => set("category", e.target.value)}>
              {CATEGORY_CODES.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Size (yards)" htmlFor="le-size">
            <Input id="le-size" type="number" min={1} max={100} value={f.sizeYards ?? ""} onChange={(e) => set("sizeYards", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" htmlFor="le-desc">
              <Textarea id="le-desc" rows={4} required value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
            </Field>
          </div>
          <Field label="Base price (USD)" htmlFor="le-price">
            <Input id="le-price" type="number" step="0.01" min={0} required value={f.basePrice ?? ""} onChange={(e) => set("basePrice", e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="le-status">
            <Select id="le-status" value={f.status ?? "draft"} onChange={(e) => set("status", e.target.value)}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </Select>
          </Field>
          <Field label="Included days" htmlFor="le-days">
            <Input id="le-days" type="number" min={1} max={90} value={f.includedDays ?? ""} onChange={(e) => set("includedDays", e.target.value)} />
          </Field>
          <Field label="Included tons" htmlFor="le-tons">
            <Input id="le-tons" type="number" step="0.5" min={0.5} value={f.includedTons ?? ""} onChange={(e) => set("includedTons", e.target.value)} />
          </Field>
          <Field label="Overage per ton (USD)" htmlFor="le-overage">
            <Input id="le-overage" type="number" step="0.01" min={0} value={f.overagePerTon ?? ""} onChange={(e) => set("overagePerTon", e.target.value)} />
          </Field>
          <Field label="Extra day (USD)" htmlFor="le-extraday">
            <Input id="le-extraday" type="number" step="0.01" min={0} value={f.extraDay ?? ""} onChange={(e) => set("extraDay", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Materials accepted (comma-separated)" htmlFor="le-acc">
              <Input id="le-acc" value={f.materialsAccepted ?? ""} onChange={(e) => set("materialsAccepted", e.target.value)} placeholder="construction debris, yard waste, furniture" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Materials prohibited (comma-separated)" htmlFor="le-pro">
              <Input id="le-pro" value={f.materialsProhibited ?? ""} onChange={(e) => set("materialsProhibited", e.target.value)} placeholder="hazardous waste, tires, liquids" />
            </Field>
          </div>
          <Field label="Service latitude" htmlFor="le-lat">
            <Input id="le-lat" type="number" step="any" value={f.serviceLat ?? ""} onChange={(e) => set("serviceLat", e.target.value)} placeholder="28.5383" />
          </Field>
          <Field label="Service longitude" htmlFor="le-lng">
            <Input id="le-lng" type="number" step="any" value={f.serviceLng ?? ""} onChange={(e) => set("serviceLng", e.target.value)} placeholder="-81.3792" />
          </Field>
          <Field label="Service radius (miles)" htmlFor="le-radius">
            <Input id="le-radius" type="number" step="any" min={1} value={f.serviceRadiusMiles ?? ""} onChange={(e) => set("serviceRadiusMiles", e.target.value)} />
          </Field>
          <Field label="Service ZIPs (comma-separated)" htmlFor="le-zips">
            <Input id="le-zips" value={f.serviceZips ?? ""} onChange={(e) => set("serviceZips", e.target.value)} placeholder="32801, 32803" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Photos" htmlFor="le-photos" hint="First photo is the primary listing image">
              <Input id="le-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => handlePhotoSelect(e.target.files)} disabled={uploading} />
            </Field>
            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((u, i) => (
                  <div key={u} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`Listing photo ${i + 1}`} className="h-20 w-20 rounded-lg border border-stone-200 object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-emerald-700 px-1 text-[10px] font-bold text-white">PRIMARY</span>}
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
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
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
