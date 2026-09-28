"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { formatCents } from "@/lib/fees";

interface FeeSchedule {
  id: string;
  version: number;
  effectiveFrom: string;
  bookingFeeCents: number;
  droppingFeeCents: number;
  processingPct: number;
  processingFlatCents: number;
  takeRatePct: number;
  cancelFullHours: number;
  cancelHalfHours: number;
  isActive: boolean;
}

const FIELD_DEFS: Array<{ key: keyof FormState; label: string; hint: string; kind: "money" | "pct" | "hours" }> = [
  { key: "bookingFeeCents", label: "Booking fee", hint: "Flat per order — platform revenue", kind: "money" },
  { key: "droppingFeeCents", label: "Dropping fee", hint: "Flat per delivery — platform revenue", kind: "money" },
  { key: "processingPct", label: "Processing %", hint: "Of pre-processing subtotal (e.g. 0.029 = 2.9%)", kind: "pct" },
  { key: "processingFlatCents", label: "Processing flat", hint: "Per order (e.g. 30 = $0.30)", kind: "money" },
  { key: "takeRatePct", label: "Take rate", hint: "Of rental subtotal, deducted from hauler payout (e.g. 0.08 = 8%)", kind: "pct" },
  { key: "cancelFullHours", label: "Full-refund hours", hint: "> this many hours before delivery → 100% rental refund", kind: "hours" },
  { key: "cancelHalfHours", label: "Half-refund hours", hint: "≥ this many hours before delivery → 50% rental refund", kind: "hours" },
];

interface FormState {
  bookingFeeCents: number;
  droppingFeeCents: number;
  processingPct: number;
  processingFlatCents: number;
  takeRatePct: number;
  cancelFullHours: number;
  cancelHalfHours: number;
}

const EMPTY: FormState = {
  bookingFeeCents: 1900,
  droppingFeeCents: 2900,
  processingPct: 0.029,
  processingFlatCents: 30,
  takeRatePct: 0.08,
  cancelFullHours: 48,
  cancelHalfHours: 24,
};

export default function AdminFeesPage() {
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/fees")
      .then((r) => r.json())
      .then((d) => {
        setSchedules(d.schedules ?? []);
        const active: FeeSchedule | undefined = (d.schedules ?? []).find((s: FeeSchedule) => s.isActive);
        if (active) {
          setForm({
            bookingFeeCents: active.bookingFeeCents,
            droppingFeeCents: active.droppingFeeCents,
            processingPct: active.processingPct,
            processingFlatCents: active.processingFlatCents,
            takeRatePct: active.takeRatePct,
            cancelFullHours: active.cancelFullHours,
            cancelHalfHours: active.cancelHalfHours,
          });
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    const r = await fetch("/api/admin/fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) {
      setError(d.error ?? "Failed to create fee schedule");
      return;
    }
    setNotice(`Fee schedule v${d.schedule.version} is now active.`);
    load();
  }

  const fmt = (key: keyof FormState, value: number) =>
    key === "processingPct" || key === "takeRatePct"
      ? `${(value * 100).toFixed(2)}%`
      : key === "bookingFeeCents" || key === "droppingFeeCents" || key === "processingFlatCents"
        ? formatCents(value)
        : `${value}h`;

  const nextVersion = schedules.length ? Math.max(...schedules.map((s) => s.version)) + 1 : 1;

  return (
    <div>
      <PageHeader title="Fee schedules" subtitle="Versioned platform fees — binding per BUILD_SPEC §3" />

      <Alert tone="amber">
        <span className="font-bold">Binding:</span> booking, dropping, processing fees and the take rate are
        non-refundable under every cancellation/refund scenario. Orders snapshot the active schedule at
        booking time, so history is always safe — old versions are kept for audit, never edited.
      </Alert>

      {loading ? (
        <div className="mt-6"><Spinner /></div>
      ) : schedules.length === 0 ? (
        <div className="mt-6"><EmptyState title="No fee schedules" body="Create the first version below." /></div>
      ) : (
        <Card className="mt-6">
          <h2 className="mb-4 text-lg font-bold text-stone-900">Schedule history</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Booking</th>
                  <th className="py-2 pr-4">Dropping</th>
                  <th className="py-2 pr-4">Processing</th>
                  <th className="py-2 pr-4">Take rate</th>
                  <th className="py-2 pr-4">Cancel windows</th>
                  <th className="py-2 pr-4">Effective</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-4 font-bold">v{s.version}</td>
                    <td className="py-2 pr-4">{formatCents(s.bookingFeeCents)}</td>
                    <td className="py-2 pr-4">{formatCents(s.droppingFeeCents)}</td>
                    <td className="py-2 pr-4">{(s.processingPct * 100).toFixed(2)}% + {formatCents(s.processingFlatCents)}</td>
                    <td className="py-2 pr-4">{(s.takeRatePct * 100).toFixed(2)}%</td>
                    <td className="py-2 pr-4">&gt;{s.cancelFullHours}h full · ≥{s.cancelHalfHours}h half</td>
                    <td className="py-2 pr-4 text-xs text-stone-500">{new Date(s.effectiveFrom).toLocaleDateString()}</td>
                    <td className="py-2">
                      <Badge tone={s.isActive ? "green" : "neutral"}>{s.isActive ? "active" : "archived"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="mb-1 text-lg font-bold text-stone-900">New fee schedule</h2>
        <p className="mb-4 text-sm text-stone-500">
          Pre-filled with the current active values. Submitting creates <span className="font-bold">v{nextVersion}</span>,
          activates it, and archives the old one. Existing orders keep their original snapshot.
        </p>
        {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}
        {notice && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_DEFS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <Input
                  type="number"
                  step={f.kind === "pct" ? "0.0001" : f.kind === "money" ? "1" : "1"}
                  min={0}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-stone-700">
            <span className="font-semibold">Preview:</span> booking {fmt("bookingFeeCents", form.bookingFeeCents)} · dropping{" "}
            {fmt("droppingFeeCents", form.droppingFeeCents)} · processing {fmt("processingPct", form.processingPct)} +{" "}
            {fmt("processingFlatCents", form.processingFlatCents)} · take rate {fmt("takeRatePct", form.takeRatePct)} ·
            cancel &gt;{form.cancelFullHours}h full / ≥{form.cancelHalfHours}h half
          </div>
          <div className="mt-4">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : `Activate v${nextVersion}`}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
