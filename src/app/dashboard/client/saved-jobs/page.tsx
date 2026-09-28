"use client";

import { useCallback, useEffect, useState } from "react";
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
import { DataTable } from "@/components/dash/DataTable";

const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

interface SavedJob {
  id: string;
  name: string;
  category: string;
  sizeYards: number | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  materialType: string | null;
  notes: string | null;
}

const emptyForm = { name: "", category: "roll_off_20", sizeYards: "", address: "", city: "", zip: "", materialType: "", notes: "" };

export default function SavedJobsPage() {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/saved-jobs");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load saved jobs");
      setJobs(json.savedJobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load saved jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof typeof emptyForm>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/saved-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          sizeYards: form.sizeYards ? Number(form.sizeYards) : null,
          address: form.address || null,
          city: form.city || null,
          zip: form.zip || null,
          materialType: form.materialType || null,
          notes: form.notes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save job");
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save job");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this saved job?")) return;
    try {
      const res = await fetch("/api/saved-jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
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
        title="Saved Jobs"
        subtitle="Save job specs for quick rebooking."
        action={
          <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Save a new job"}
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="sj-name">
              <Input id="sj-name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Kitchen remodel cleanout" maxLength={120} />
            </Field>
            <Field label="Category" htmlFor="sj-category">
              <Select id="sj-category" value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORY_CODES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Size (yards)" htmlFor="sj-size">
              <Input id="sj-size" type="number" min={1} max={100} value={form.sizeYards} onChange={(e) => set("sizeYards", e.target.value)} placeholder="20" />
            </Field>
            <Field label="Material type" htmlFor="sj-material">
              <Input id="sj-material" value={form.materialType} onChange={(e) => set("materialType", e.target.value)} placeholder="Construction debris" maxLength={120} />
            </Field>
            <Field label="Address" htmlFor="sj-address">
              <Input id="sj-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" maxLength={200} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City" htmlFor="sj-city">
                <Input id="sj-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Orlando" maxLength={80} />
              </Field>
              <Field label="ZIP" htmlFor="sj-zip">
                <Input id="sj-zip" value={form.zip} onChange={(e) => set("zip", e.target.value)} placeholder="32801" maxLength={10} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="sj-notes">
                <Textarea id="sj-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Driveway placement, gate code…" maxLength={2000} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save job"}</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner label="Loading saved jobs…" />
      ) : (
        <DataTable<SavedJob>
          data={jobs}
          rowKey={(r) => r.id}
          emptyTitle="No saved jobs"
          emptyBody="Save the specs of jobs you book often to rebook in one tap later."
          columns={[
            { header: "Name", render: (r) => <span className="font-semibold">{r.name}</span> },
            {
              header: "Spec",
              render: (r) => (
                <span className="text-stone-600">
                  {r.category.replace(/_/g, " ")}
                  {r.sizeYards ? ` · ${r.sizeYards} yd` : ""}
                  {r.materialType ? ` · ${r.materialType}` : ""}
                </span>
              ),
            },
            {
              header: "Location",
              render: (r) => (
                <span className="text-stone-600">
                  {[r.address, r.city, r.zip].filter(Boolean).join(", ") || "—"}
                </span>
              ),
            },
            {
              header: "",
              className: "text-right",
              render: (r) => (
                <Button size="sm" variant="danger" onClick={() => remove(r.id)}>
                  Delete
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
