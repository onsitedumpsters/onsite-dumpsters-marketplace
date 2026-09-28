"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui";

const EVIDENCE_KINDS = ["delivery", "pickup", "weight_ticket", "damage", "other"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Uploads a photo to /api/uploads, then attaches it to the order as
 * evidence via /api/orders/[id]/evidence. Validates type + size client-side.
 */
export function EvidenceUploader({
  orderId,
  kind = "delivery",
  onUploaded,
}: {
  orderId: string;
  kind?: EvidenceKind;
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setDone(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPEG, PNG, or WebP images are accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/uploads", { method: "POST", body: form });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upJson.error ?? "Upload failed");
      const attach = await fetch(`/api/orders/${orderId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, url: upJson.url as string }),
      });
      const attachJson = await attach.json().catch(() => ({}));
      if (!attach.ok) throw new Error(attachJson.error ?? "Could not attach photo");
      setDone(true);
      onUploaded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4">
      <p className="text-sm font-semibold text-stone-800">
        {kind === "delivery" && "Delivery photo proof"}
        {kind === "pickup" && "Pickup photo proof"}
        {kind === "weight_ticket" && "Weight ticket photo"}
        {kind === "damage" && "Damage documentation"}
        {kind === "other" && "Other evidence"}
      </p>
      <p className="mt-0.5 text-xs text-stone-500">JPEG, PNG, or WebP · max 5 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="mt-3 block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-800"
        disabled={busy}
        aria-label={`${kind} photo upload`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      {busy && <p className="mt-2 text-xs text-stone-500" role="status">Uploading…</p>}
      {done && (
        <div className="mt-2">
          <Alert tone="green">Photo uploaded and attached to this order.</Alert>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
    </div>
  );
}
