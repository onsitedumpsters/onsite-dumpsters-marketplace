"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ContainerType } from "@prisma/client";
import {
  PageHeader,
  Card,
  Button,
  Alert,
  Spinner,
  Input,
  Select,
  Field,
  Badge,
} from "@/components/ui";
import { DataTable } from "@/components/dash/DataTable";

const TYPE_CODES = Object.values(ContainerType);

interface ContainerRow {
  id: string;
  assetTag: string | null;
  sizeYards: number;
  containerType: string;
  condition: string;
  depotCity: string;
  status: string;
  assignedProvider: { id: string; name: string | null } | null;
  _count: { listings: number };
}

const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "red" | "blue"> = {
  available: "green",
  assigned: "blue",
  maintenance: "amber",
  retired: "neutral",
};

export default function FleetContainersPage() {
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [assetTag, setAssetTag] = useState("");
  const [sizeYards, setSizeYards] = useState("20");
  const [containerType, setContainerType] = useState<string>("roll_off");
  const [condition, setCondition] = useState("good");
  const [depotAddress, setDepotAddress] = useState("");
  const [depotCity, setDepotCity] = useState("Orlando");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fleet/containers");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load containers");
      setContainers(json.containers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load containers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fleet/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetTag: assetTag || null,
          sizeYards: Number(sizeYards),
          containerType,
          condition,
          depotAddress: depotAddress || null,
          depotCity,
          status: "available",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not register container");
      setAssetTag(""); setDepotAddress(""); setShowNew(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register container");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this container from the registry?")) return;
    try {
      const res = await fetch(`/api/fleet/containers/${id}`, { method: "DELETE" });
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
        title="Container registry"
        subtitle="Every container: size, type, condition, depot, photos, status."
        action={
          <Button onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Close" : "Register container"}
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
          <h2 className="mb-4 font-bold text-stone-900">Register container</h2>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Asset tag" htmlFor="fc-tag">
              <Input id="fc-tag" value={assetTag} onChange={(e) => setAssetTag(e.target.value)} placeholder="OD-20-0142" maxLength={40} />
            </Field>
            <Field label="Size (yards)" htmlFor="fc-size">
              <Input id="fc-size" type="number" min={1} max={100} required value={sizeYards} onChange={(e) => setSizeYards(e.target.value)} />
            </Field>
            <Field label="Container type" htmlFor="fc-type">
              <Select id="fc-type" value={containerType} onChange={(e) => setContainerType(e.target.value)}>
                {TYPE_CODES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Condition" htmlFor="fc-cond">
              <Select id="fc-cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
                {["excellent", "good", "fair", "needs_repair"].map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Depot address" htmlFor="fc-depot">
              <Input id="fc-depot" value={depotAddress} onChange={(e) => setDepotAddress(e.target.value)} placeholder="4400 W Colonial Dr" maxLength={200} />
            </Field>
            <Field label="Depot city" htmlFor="fc-city">
              <Input id="fc-city" value={depotCity} onChange={(e) => setDepotCity(e.target.value)} maxLength={80} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? "Registering…" : "Register container"}</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Spinner label="Loading containers…" />
      ) : (
        <DataTable<ContainerRow>
          data={containers}
          rowKey={(r) => r.id}
          emptyTitle="No containers registered"
          emptyBody="Register your first container to start building the fleet."
          columns={[
            {
              header: "Container",
              render: (r) => (
                <span>
                  <Link href={`/dashboard/fleet/containers/${r.id}`} className="font-semibold text-emerald-800 hover:underline">
                    {r.assetTag ?? r.id.slice(0, 8)}
                  </Link>
                  <span className="block text-xs text-stone-500">
                    {r.sizeYards} yd · {r.containerType.replace(/_/g, " ")} · {r.condition}
                  </span>
                </span>
              ),
            },
            {
              header: "Assigned to",
              render: (r) => <span className="text-sm">{r.assignedProvider?.name ?? "—"}</span>,
            },
            { header: "Listings", render: (r) => <span className="tabular-nums">{r._count.listings}</span> },
            { header: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge> },
            {
              header: "",
              className: "text-right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <Link href={`/dashboard/fleet/containers/${r.id}`}>
                    <Button size="sm" variant="outline">Manage</Button>
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
