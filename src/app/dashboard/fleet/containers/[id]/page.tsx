"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ContainerType, ContainerStatus } from "@prisma/client";
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

const TYPE_CODES = Object.values(ContainerType);
const STATUS_CODES = Object.values(ContainerStatus);

interface ContainerDetail {
  id: string;
  assetTag: string | null;
  sizeYards: number;
  containerType: string;
  condition: string;
  depotAddress: string | null;
  depotCity: string;
  depotLat: number | null;
  depotLng: number | null;
  photos: string[];
  status: string;
  notes: string | null;
  assignedProvider: { id: string; name: string | null } | null;
}

interface ProviderOption {
  id: string;
  name: string | null;
  providerProfile: { businessName: string; city: string } | null;
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

export default function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [container, setContainer] = useState<ContainerDetail | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [f, setF] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/fleet/containers/${id}`),
        fetch("/api/fleet/assign"),
      ]);
      const cJson = await cRes.json();
      if (!cRes.ok) throw new Error(cJson.error ?? "Could not load container");
      const c: ContainerDetail = cJson.container;
      setContainer(c);
      setPhotos(c.photos ?? []);
      setAssignTo(c.assignedProvider?.id ?? "");
      setF({
        assetTag: c.assetTag ?? "",
        sizeYards: String(c.sizeYards),
        containerType: c.containerType,
        condition: c.condition,
        depotAddress: c.depotAddress ?? "",
        depotCity: c.depotCity,
        depotLat: c.depotLat != null ? String(c.depotLat) : "",
        depotLng: c.depotLng != null ? String(c.depotLng) : "",
        status: c.status,
        notes: c.notes ?? "",
      });
      if (pRes.ok) {
        const pJson = await pRes.json();
        setProviders(pJson.providers ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load container");
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
    setMessage(null);
    try {
      const urls = await uploadFiles(files);
      setPhotos((p) => [...p, ...urls]);
    } catch (e) {
      setMessage({ tone: "red", text: e instanceof Error ? e.message : "Photo upload failed" });
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/fleet/containers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetTag: f.assetTag || null,
          sizeYards: Number(f.sizeYards),
          containerType: f.containerType,
          condition: f.condition,
          depotAddress: f.depotAddress || null,
          depotCity: f.depotCity || undefined,
          depotLat: f.depotLat ? Number(f.depotLat) : null,
          depotLng: f.depotLng ? Number(f.depotLng) : null,
          photos,
          status: f.status,
          notes: f.notes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save container");
      setMessage({ tone: "green", text: "Container updated." });
      await load();
    } catch (e) {
      setMessage({ tone: "red", text: e instanceof Error ? e.message : "Could not save container" });
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/fleet/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId: id, providerId: assignTo || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Assignment failed");
      setMessage({
        tone: "green",
        text: assignTo ? "Container assigned to provider." : "Container unassigned.",
      });
      await load();
    } catch (e) {
      setMessage({ tone: "red", text: e instanceof Error ? e.message : "Assignment failed" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading container…" />;
  if (error && !container) {
    return (
      <div>
        <PageHeader title="Container" />
        <Alert tone="red">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Container ${container?.assetTag ?? id.slice(0, 8)}`}
        subtitle={`${container?.sizeYards} yd · ${container?.containerType.replace(/_/g, " ")} · ${container?.status}`}
        action={
          <Link href="/dashboard/fleet/containers" className="text-sm font-semibold text-emerald-800 hover:underline">
            ← All containers
          </Link>
        }
      />
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card>
        <h2 className="mb-3 font-bold text-stone-900">Assign to provider</h2>
        <p className="mb-3 text-sm text-stone-500">
          Only verification-approved providers are eligible. Assigning sets the container status to “assigned”.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <Field label="Provider" htmlFor="assign-provider">
              <Select id="assign-provider" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">— Unassigned —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.providerProfile?.businessName ?? p.name ?? p.id} ({p.providerProfile?.city ?? ""})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button onClick={assign} disabled={busy}>Apply assignment</Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-stone-900">Container details</h2>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label="Asset tag" htmlFor="cd-tag">
            <Input id="cd-tag" value={f.assetTag ?? ""} onChange={(e) => set("assetTag", e.target.value)} maxLength={40} />
          </Field>
          <Field label="Size (yards)" htmlFor="cd-size">
            <Input id="cd-size" type="number" min={1} max={100} required value={f.sizeYards ?? ""} onChange={(e) => set("sizeYards", e.target.value)} />
          </Field>
          <Field label="Container type" htmlFor="cd-type">
            <Select id="cd-type" value={f.containerType ?? ""} onChange={(e) => set("containerType", e.target.value)}>
              {TYPE_CODES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Condition" htmlFor="cd-cond">
            <Select id="cd-cond" value={f.condition ?? ""} onChange={(e) => set("condition", e.target.value)}>
              {["excellent", "good", "fair", "needs_repair"].map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="cd-status">
            <Select id="cd-status" value={f.status ?? ""} onChange={(e) => set("status", e.target.value)}>
              {STATUS_CODES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Depot city" htmlFor="cd-city">
            <Input id="cd-city" value={f.depotCity ?? ""} onChange={(e) => set("depotCity", e.target.value)} maxLength={80} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Depot address" htmlFor="cd-depot">
              <Input id="cd-depot" value={f.depotAddress ?? ""} onChange={(e) => set("depotAddress", e.target.value)} maxLength={200} />
            </Field>
          </div>
          <Field label="Depot latitude" htmlFor="cd-lat">
            <Input id="cd-lat" type="number" step="any" value={f.depotLat ?? ""} onChange={(e) => set("depotLat", e.target.value)} />
          </Field>
          <Field label="Depot longitude" htmlFor="cd-lng">
            <Input id="cd-lng" type="number" step="any" value={f.depotLng ?? ""} onChange={(e) => set("depotLng", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" htmlFor="cd-notes">
              <Textarea id="cd-notes" rows={2} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Photos" htmlFor="cd-photos">
              <Input id="cd-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={(e) => handlePhotoSelect(e.target.files)} />
            </Field>
            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((u) => (
                  <div key={u} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="Container photo" className="h-20 w-20 rounded-lg border border-stone-200 object-cover" />
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
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
