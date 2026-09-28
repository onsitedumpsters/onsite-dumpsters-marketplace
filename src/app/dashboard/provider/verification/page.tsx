"use client";

import { useCallback, useEffect, useState } from "react";
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

const DOC_KINDS = ["insurance", "authority", "business_license", "other"] as const;

interface Doc {
  kind: string;
  url: string;
  expiryDate?: string;
}

export default function VerificationPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [f, setF] = useState<Record<string, string>>({
    businessName: "",
    contactName: "",
    phone: "",
    address: "",
    city: "Orlando",
    state: "FL",
    zip: "",
    serviceRadiusMiles: "30",
    serviceZips: "",
    bio: "",
    insuranceProvider: "",
    insurancePolicyNo: "",
    insuranceExpiry: "",
    authorityNumber: "",
  });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docKind, setDocKind] = useState<(typeof DOC_KINDS)[number]>("insurance");
  const [docExpiry, setDocExpiry] = useState("");

  function set<K extends string>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/provider/verification");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load verification");
      if (json.profile) {
        const p = json.profile;
        setStatus(p.verificationStatus);
        setNotes(p.verificationNotes ?? null);
        setF((prev) => ({
          ...prev,
          businessName: p.businessName ?? "",
          contactName: p.contactName ?? "",
          phone: p.phone ?? "",
          address: p.address ?? "",
          city: p.city ?? "Orlando",
          state: p.state ?? "FL",
          zip: p.zip ?? "",
          serviceRadiusMiles: String(p.serviceRadiusMiles ?? 30),
          serviceZips: (p.serviceZips ?? []).join(", "),
          bio: p.bio ?? "",
          insuranceProvider: p.insuranceProvider ?? "",
          insurancePolicyNo: p.insurancePolicyNo ?? "",
          insuranceExpiry: p.insuranceExpiry ? String(p.insuranceExpiry).slice(0, 10) : "",
          authorityNumber: p.authorityNumber ?? "",
        }));
        setDocs((json.docs ?? []).map((d: { kind: string; url: string; expiryDate: string | null }) => ({
          kind: d.kind,
          url: d.url,
          expiryDate: d.expiryDate ? String(d.expiryDate).slice(0, 10) : undefined,
        })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load verification");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDocUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const next: Doc[] = [...docs];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        next.push({ kind: docKind, url: json.url, expiryDate: docExpiry || undefined });
      }
      setDocs(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/provider/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: f.businessName,
          contactName: f.contactName || undefined,
          phone: f.phone || undefined,
          address: f.address || undefined,
          city: f.city || undefined,
          state: f.state || undefined,
          zip: f.zip || undefined,
          serviceRadiusMiles: f.serviceRadiusMiles ? Number(f.serviceRadiusMiles) : undefined,
          serviceZips: f.serviceZips.split(",").map((s) => s.trim()).filter(Boolean),
          bio: f.bio || undefined,
          insuranceProvider: f.insuranceProvider || undefined,
          insurancePolicyNo: f.insurancePolicyNo || undefined,
          insuranceExpiry: f.insuranceExpiry ? new Date(f.insuranceExpiry).toISOString() : undefined,
          authorityNumber: f.authorityNumber || undefined,
          docs: docs.map((d) => ({
            kind: d.kind,
            url: d.url,
            expiryDate: d.expiryDate ? new Date(d.expiryDate).toISOString() : undefined,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Submission failed");
      setOk(true);
      setStatus("pending");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading verification…" />;

  return (
    <div>
      <PageHeader
        title="Verification"
        subtitle="Business profile and compliance documents for marketplace trust & safety."
        action={status ? <Badge tone={status === "approved" ? "green" : status === "rejected" ? "red" : "amber"}>{status}</Badge> : undefined}
      />
      {notes && (
        <div className="mb-4">
          <Alert tone="amber">Reviewer notes: {notes}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
      {ok && (
        <div className="mb-4">
          <Alert tone="green">Submitted — your profile is pending review.</Alert>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <h2 className="mb-4 font-bold text-stone-900">Business profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Business name" htmlFor="v-business">
                <Input id="v-business" required value={f.businessName} onChange={(e) => set("businessName", e.target.value)} maxLength={120} />
              </Field>
            </div>
            <Field label="Contact name" htmlFor="v-contact">
              <Input id="v-contact" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} maxLength={120} />
            </Field>
            <Field label="Phone" htmlFor="v-phone">
              <Input id="v-phone" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" htmlFor="v-address">
                <Input id="v-address" value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
              </Field>
            </div>
            <Field label="City" htmlFor="v-city">
              <Input id="v-city" value={f.city} onChange={(e) => set("city", e.target.value)} maxLength={80} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="State" htmlFor="v-state">
                <Input id="v-state" value={f.state} onChange={(e) => set("state", e.target.value)} maxLength={10} />
              </Field>
              <Field label="ZIP" htmlFor="v-zip">
                <Input id="v-zip" value={f.zip} onChange={(e) => set("zip", e.target.value)} placeholder="32801" maxLength={10} />
              </Field>
            </div>
            <Field label="Service radius (miles)" htmlFor="v-radius">
              <Input id="v-radius" type="number" min={1} max={500} value={f.serviceRadiusMiles} onChange={(e) => set("serviceRadiusMiles", e.target.value)} />
            </Field>
            <Field label="Service ZIPs (comma-separated)" htmlFor="v-zips">
              <Input id="v-zips" value={f.serviceZips} onChange={(e) => set("serviceZips", e.target.value)} placeholder="32801, 32803" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Bio" htmlFor="v-bio">
                <Textarea id="v-bio" rows={3} value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={2000} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-bold text-stone-900">Insurance &amp; authority</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance provider" htmlFor="v-ins">
              <Input id="v-ins" value={f.insuranceProvider} onChange={(e) => set("insuranceProvider", e.target.value)} maxLength={120} />
            </Field>
            <Field label="Policy number" htmlFor="v-pol">
              <Input id="v-pol" value={f.insurancePolicyNo} onChange={(e) => set("insurancePolicyNo", e.target.value)} maxLength={80} />
            </Field>
            <Field label="Insurance expiry" htmlFor="v-exp">
              <Input id="v-exp" type="date" value={f.insuranceExpiry} onChange={(e) => set("insuranceExpiry", e.target.value)} />
            </Field>
            <Field label="Authority / DOT number" htmlFor="v-auth">
              <Input id="v-auth" value={f.authorityNumber} onChange={(e) => set("authorityNumber", e.target.value)} maxLength={80} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-bold text-stone-900">Documents</h2>
          <p className="mb-4 text-sm text-stone-500">
            Upload insurance certificates, operating authority, or business licenses (image files, ≤5 MB).
          </p>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Document kind" htmlFor="v-dockind">
              <Select id="v-dockind" value={docKind} onChange={(e) => setDocKind(e.target.value as typeof docKind)}>
                {DOC_KINDS.map((k) => (
                  <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Expiry (optional)" htmlFor="v-docexp">
              <Input id="v-docexp" type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
            </Field>
            <div>
              <span className="mb-1 block text-sm font-semibold text-stone-800">File</span>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading}
                onChange={(e) => handleDocUpload(e.target.files)}
                aria-label="Verification document upload"
              />
            </div>
          </div>
          {uploading && <p className="text-xs text-stone-500" role="status">Uploading…</p>}
          {docs.length > 0 ? (
            <ul className="space-y-2">
              {docs.map((d, i) => (
                <li key={`${d.url}-${i}`} className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                  <span>
                    <Badge tone="neutral">{d.kind.replace(/_/g, " ")}</Badge>
                    <span className="ml-2 break-all text-stone-600">{d.url}</span>
                    {d.expiryDate && <span className="ml-2 text-xs text-stone-400">expires {d.expiryDate}</span>}
                  </span>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setDocs((prev) => prev.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">No documents attached yet.</p>
          )}
        </Card>

        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Submitting…" : "Submit for verification"}
        </Button>
      </form>
    </div>
  );
}
