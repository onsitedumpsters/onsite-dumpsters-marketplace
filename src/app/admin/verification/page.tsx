"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, Textarea } from "@/components/ui";

interface QueueItem {
  id: string;
  userId: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  city: string;
  state: string;
  zip: string | null;
  insuranceProvider: string | null;
  insurancePolicyNo: string | null;
  insuranceExpiry: string | null;
  authorityNumber: string | null;
  verificationStatus: string;
  verificationNotes: string | null;
  createdAt: string;
  user: {
    name: string | null;
    email: string;
    verificationDocs: Array<{ id: string; kind: string; url: string; expiryDate: string | null; status: string; notes: string | null; createdAt: string }>;
  };
}

type Decision = "approved" | "rejected" | "suspended";

function insuranceTone(expiry: string | null): "red" | "amber" | "neutral" {
  if (!expiry) return "neutral";
  const days = (new Date(expiry).getTime() - Date.now()) / 864e5;
  if (days < 0) return "red";
  if (days < 30) return "amber";
  return "neutral";
}

export default function AdminVerificationPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/verify")
      .then((r) => r.json())
      .then((d) => {
        setQueue(d.queue ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load verification queue");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(item: QueueItem, decision: Decision) {
    setBusy(item.userId);
    setError(null);
    const r = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: item.userId, decision, notes: notes[item.userId] || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setError(d.error ?? "Decision failed");
      return;
    }
    load();
  }

  const statusTone = (s: string): "amber" | "red" | "green" | "neutral" =>
    s === "pending" ? "amber" : s === "rejected" ? "red" : s === "approved" ? "green" : "neutral";

  return (
    <div>
      <PageHeader title="Provider verification" subtitle="Review business docs, insurance, and authority before approving" />
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}

      {loading ? (
        <Spinner />
      ) : queue.length === 0 ? (
        <EmptyState title="Queue is clear" body="No providers are pending or rejected verification." />
      ) : (
        <div className="space-y-6">
          {queue.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-stone-900">{item.businessName}</h2>
                  <p className="text-sm text-stone-500">
                    {item.user.name} · {item.user.email} · {item.phone ?? "no phone"} · {item.city}, {item.state} {item.zip ?? ""}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">Applied {new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
                <Badge tone={statusTone(item.verificationStatus)}>{item.verificationStatus}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-stone-50 p-3 text-sm">
                  <p className="font-semibold">Insurance</p>
                  <p>{item.insuranceProvider ?? "—"} {item.insurancePolicyNo ? `· ${item.insurancePolicyNo}` : ""}</p>
                  <p className="mt-1">
                    <Badge tone={insuranceTone(item.insuranceExpiry)}>
                      {item.insuranceExpiry
                        ? `expires ${new Date(item.insuranceExpiry).toLocaleDateString()}`
                        : "no expiry on file"}
                    </Badge>
                  </p>
                </div>
                <div className="rounded-lg bg-stone-50 p-3 text-sm">
                  <p className="font-semibold">Authority</p>
                  <p>{item.authorityNumber ?? "—"}</p>
                  {item.contactName && <p className="mt-1 text-stone-500">Contact: {item.contactName}</p>}
                </div>
                <div className="rounded-lg bg-stone-50 p-3 text-sm">
                  <p className="font-semibold">Documents ({item.user.verificationDocs.length})</p>
                  {item.user.verificationDocs.length === 0 ? (
                    <p className="text-stone-500">No documents uploaded</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {item.user.verificationDocs.map((d) => (
                        <li key={d.id}>
                          <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">
                            {d.kind}
                          </a>{" "}
                          <Badge tone={d.status === "approved" ? "green" : d.status === "rejected" ? "red" : "neutral"}>{d.status}</Badge>
                          {d.expiryDate && <span className="ml-1 text-xs text-stone-500">exp {new Date(d.expiryDate).toLocaleDateString()}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {item.verificationNotes && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <span className="font-semibold">Previous notes:</span> {item.verificationNotes}
                </p>
              )}

              <div className="mt-4">
                <Textarea
                  rows={2}
                  placeholder="Decision notes (shown to the provider for rejections/suspensions)…"
                  value={notes[item.userId] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [item.userId]: e.target.value })}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === item.userId} onClick={() => decide(item, "approved")}>
                  {busy === item.userId ? "Saving…" : "Approve"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy === item.userId} onClick={() => decide(item, "rejected")}>
                  Reject
                </Button>
                <Button size="sm" variant="danger" disabled={busy === item.userId} onClick={() => decide(item, "suspended")}>
                  Suspend
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
