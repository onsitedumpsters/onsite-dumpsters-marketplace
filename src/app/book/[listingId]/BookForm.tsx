"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { calculateFees, CANCELLATION_POLICY_TEXT, type FeeScheduleInput } from "@/lib/fees";
import { FeeBreakdownTable } from "@/components/FeeBreakdown";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";

interface BookFormProps {
  listing: {
    id: string;
    title: string;
    category: string;
    sizeYards: number | null;
    basePriceCents: number;
    includedDays: number;
    includedTons: number;
    materialsProhibited: string[];
    providerName: string;
  };
  schedule: FeeScheduleInput;
}

const DELIVERY_WINDOWS = ["8am – 12pm", "12pm – 4pm", "4pm – 8pm", "Anytime"];
const PROJECT_TYPES = [
  "Home cleanout",
  "Renovation / remodel",
  "Roofing",
  "Yard waste",
  "Construction",
  "Commercial",
  "Other",
];

export function BookForm({ listing, schedule }: BookFormProps) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Orlando");
  const [zip, setZip] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryWindow, setDeliveryWindow] = useState("Anytime");
  const [projectType, setProjectType] = useState("Home cleanout");
  const [materialType, setMaterialType] = useState("");
  const [placementNotes, setPlacementNotes] = useState("");
  const [ackProhibited, setAckProhibited] = useState(false);
  const [ackPolicy, setAckPolicy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const breakdown = useMemo(
    () => calculateFees(listing.basePriceCents, schedule),
    [listing.basePriceCents, schedule],
  );

  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const canSubmit =
    address.trim().length >= 5 && deliveryDate !== "" && ackProhibited && ackPolicy && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          deliveryAddress: address.trim(),
          deliveryCity: city.trim() || undefined,
          deliveryZip: zip.trim() || undefined,
          placementNotes: placementNotes.trim() || undefined,
          projectType,
          materialType: materialType.trim() || undefined,
          deliveryDate: new Date(deliveryDate).toISOString(),
          deliveryWindow,
          policyAccepted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create your booking");
      router.push(`/checkout/${data.orderId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <h2 className="mb-1 text-base font-bold text-stone-900">{listing.title}</h2>
        <p className="text-sm text-stone-500">
          {listing.providerName}
          {listing.sizeYards ? ` · ${listing.sizeYards} yd` : ""} · {listing.includedDays} days
          included · {listing.includedTons} tons included
        </p>
      </Card>

      <Card>
        <h2 className="mb-4 text-base font-bold text-stone-900">Delivery details</h2>
        <div className="space-y-4">
          <Field label="Delivery address" htmlFor="address">
            <Input
              id="address"
              required
              minLength={5}
              placeholder="1234 Main St"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" htmlFor="city">
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="ZIP" htmlFor="zip">
              <Input
                id="zip"
                inputMode="numeric"
                placeholder="32801"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Delivery date" htmlFor="deliveryDate" hint="Earliest: tomorrow">
              <Input
                id="deliveryDate"
                type="date"
                required
                min={tomorrow}
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </Field>
            <Field label="Delivery window" htmlFor="deliveryWindow">
              <Select
                id="deliveryWindow"
                value={deliveryWindow}
                onChange={(e) => setDeliveryWindow(e.target.value)}
              >
                {DELIVERY_WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project type" htmlFor="projectType">
              <Select
                id="projectType"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
              >
                {PROJECT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Material type" htmlFor="materialType" hint="e.g. household junk, shingles">
              <Input
                id="materialType"
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Placement notes"
            htmlFor="placementNotes"
            hint="Gate codes, driveway placement, overhead wires…"
          >
            <Textarea
              id="placementNotes"
              rows={3}
              value={placementNotes}
              onChange={(e) => setPlacementNotes(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold text-stone-900">Total due today</h2>
        <FeeBreakdownTable breakdown={breakdown} />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold text-stone-900">Required acknowledgments</h2>
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-emerald-700"
              checked={ackProhibited}
              onChange={(e) => setAckProhibited(e.target.checked)}
            />
            <span>
              I understand the following materials are <strong>prohibited</strong> in this dumpster
              and I will not load them
              {listing.materialsProhibited.length > 0 ? (
                <>
                  : <em>{listing.materialsProhibited.join(", ")}</em>
                </>
              ) : (
                "."
              )}{" "}
              Contamination may result in additional charges.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-emerald-700"
              checked={ackPolicy}
              onChange={(e) => setAckPolicy(e.target.checked)}
            />
            <span>
              I have read and accept the{" "}
              <Link href="/terms" target="_blank" className="font-semibold text-emerald-700 hover:underline">
                cancellation policy (Terms §5)
              </Link>
              : <em className="not-italic">{CANCELLATION_POLICY_TEXT}</em>
            </span>
          </label>
        </div>
      </Card>

      {error && <Alert tone="red">{error}</Alert>}

      <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
        {submitting ? "Creating your booking…" : "Continue to secure checkout"}
      </Button>
    </form>
  );
}
