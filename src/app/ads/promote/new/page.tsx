"use client";

import { useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Alert,
  Spinner,
  Input,
  Field,
} from "@/components/ui";
import { formatCents } from "@/lib/fees";

interface Placement {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  durationDays: number;
  maxSlots: number;
}

interface ListingOption {
  id: string;
  title: string;
}

const STEPS = ["Pick listing", "Pick placement", "Dates", "Review & pay"] as const;

export default function PromoteWizardPage() {
  const [step, setStep] = useState(0);
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listingId, setListingId] = useState<string>("");
  const [placementId, setPlacementId] = useState("");
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [pRes, lRes] = await Promise.all([
          fetch("/api/ads/placements"),
          fetch("/api/provider/listings").catch(() => null),
        ]);
        const pJson = await pRes.json();
        if (!pRes.ok) throw new Error(pJson.error ?? "Could not load placements");
        setPlacements(pJson.placements ?? []);
        if (lRes && lRes.ok) {
          const lJson = await lRes.json();
          setListings((lJson.listings ?? []).map((l: { id: string; title: string }) => ({ id: l.id, title: l.title })));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load wizard data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const placement = placements.find((p) => p.id === placementId);
  const endsAt = placement
    ? new Date(new Date(startsAt).getTime() + placement.durationDays * 86_400_000)
    : null;

  async function handleImageUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setImageUrl(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      // 1. Create draft campaign
      const cRes = await fetch("/api/ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listingId || null,
          placementId,
          title,
          imageUrl: imageUrl || null,
          targetUrl: targetUrl || null,
          startsAt: new Date(startsAt).toISOString(),
        }),
      });
      const cJson = await cRes.json().catch(() => ({}));
      if (!cRes.ok) throw new Error(cJson.error ?? "Could not create campaign");
      const campaignId = cJson.campaign.id as string;

      // 2. Stripe Checkout
      const kRes = await fetch(`/api/ads/campaigns/${campaignId}/checkout`, { method: "POST" });
      const kJson = await kRes.json().catch(() => ({}));
      if (kRes.status === 503) {
        throw new Error(
          kJson.message ?? "Payments are not configured yet — the campaign was saved as a draft.",
        );
      }
      if (!kRes.ok) throw new Error(kJson.error ?? "Checkout failed");
      window.location.href = kJson.url as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading…" />;

  const canNext =
    (step === 0) ||
    (step === 1 && placementId) ||
    (step === 2 && startsAt && title.trim().length >= 3);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Promote" subtitle="Sponsored placements — always labeled, never outranking organic results." />

      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Wizard steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              i === step ? "bg-emerald-700 text-white" : i < step ? "bg-emerald-100 text-emerald-900" : "bg-stone-100 text-stone-500"
            }`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}

      <Card>
        {step === 0 && (
          <div>
            <h2 className="mb-2 font-bold text-stone-900">Step 1 — Pick a listing (optional)</h2>
            <p className="mb-4 text-sm text-stone-500">
              Link the campaign to one of your listings, or skip to promote your brand.
            </p>
            {listings.length === 0 ? (
              <Alert tone="neutral">No listings found — you can promote without linking a listing.</Alert>
            ) : (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 has-checked:border-emerald-600">
                  <input type="radio" name="listing" checked={listingId === ""} onChange={() => setListingId("")} />
                  <span className="text-sm font-medium">No listing — brand promotion</span>
                </label>
                {listings.map((l) => (
                  <label key={l.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 has-checked:border-emerald-600">
                    <input type="radio" name="listing" checked={listingId === l.id} onChange={() => setListingId(l.id)} />
                    <span className="text-sm font-medium">{l.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="mb-2 font-bold text-stone-900">Step 2 — Pick a placement</h2>
            <p className="mb-4 text-sm text-stone-500">
              Sponsored slots are separate and labeled (max 3 per search page).
            </p>
            <div className="space-y-2">
              {placements.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-4 has-checked:border-emerald-600">
                  <input type="radio" name="placement" className="mt-1" checked={placementId === p.id} onChange={() => setPlacementId(p.id)} />
                  <span>
                    <span className="block font-semibold text-stone-900">{p.name}</span>
                    {p.description && <span className="block text-sm text-stone-500">{p.description}</span>}
                    <span className="mt-1 block text-sm font-bold text-emerald-800">
                      {formatCents(p.priceCents)} / {p.durationDays} days
                    </span>
                  </span>
                </label>
              ))}
              {placements.length === 0 && <p className="text-sm text-stone-500">No active placements right now.</p>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <h2 className="font-bold text-stone-900 sm:col-span-2">Step 3 — Dates &amp; creative</h2>
            <Field label="Campaign title" htmlFor="ad-title">
              <Input id="ad-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="20-Yard Dumpsters — Orlando" maxLength={120} />
            </Field>
            <Field label="Start date" htmlFor="ad-start" hint={placement ? `Auto-ends after ${placement.durationDays} days` : undefined}>
              <Input id="ad-start" type="date" value={startsAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Creative image (optional)" htmlFor="ad-image" hint="Shown in the sponsored slot; admin approves creatives before launch">
                <Input id="ad-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => handleImageUpload(e.target.files)} />
              </Field>
              {imageUrl && <p className="mt-1 break-all text-xs text-emerald-800">Uploaded: {imageUrl}</p>}
            </div>
            <div className="sm:col-span-2">
              <Field label="Target URL (optional)" htmlFor="ad-url">
                <Input id="ad-url" type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" />
              </Field>
            </div>
            {endsAt && (
              <p className="text-sm text-stone-600 sm:col-span-2">
                Campaign flight: <strong>{new Date(startsAt).toLocaleDateString()} → {endsAt.toLocaleDateString()}</strong>
              </p>
            )}
          </div>
        )}

        {step === 3 && placement && (
          <div>
            <h2 className="mb-3 font-bold text-stone-900">Step 4 — Review &amp; pay</h2>
            <dl className="space-y-2 rounded-lg bg-stone-50 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-stone-500">Title</dt><dd className="font-medium">{title}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">Placement</dt><dd className="font-medium">{placement.name}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">Flight</dt><dd className="font-medium">{new Date(startsAt).toLocaleDateString()} → {endsAt?.toLocaleDateString()}</dd></div>
              <div className="flex justify-between border-t border-stone-200 pt-2"><dt className="font-bold">Total due (non-refundable)</dt><dd className="text-lg font-bold text-emerald-800">{formatCents(placement.priceCents)}</dd></div>
            </dl>
            <Alert tone="amber">
              <span className="text-xs">
                Ad spend is platform revenue — 100% kept by the marketplace, non-refundable. Your
                campaign goes to admin approval after payment; creatives must be approved before launch.
              </span>
            </Alert>
            <Button className="mt-4" size="lg" disabled={busy} onClick={pay}>
              {busy ? "Processing…" : `Pay ${formatCents(placement.priceCents)} & launch`}
            </Button>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < 3 && (
            <Button variant="outline" disabled={!canNext || busy} onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
