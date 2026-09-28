"use client";

import { useEffect } from "react";

/**
 * TEMPORARY diagnostic error boundary (remove after /search crash is fixed).
 * Displays the exact client-side error instead of the generic message.
 */
export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      document.title = `ROUTEERR: ${String(error?.message ?? error).slice(0, 200)}`;
    } catch {
      /* noop */
    }
  }, [error]);
  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 13 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Diagnostic: search route error
      </h1>
      <p>
        <strong>Message:</strong> {String(error?.message ?? error)}
      </p>
      <p>
        <strong>Name:</strong> {String(error?.name ?? "")}
      </p>
      <p>
        <strong>Digest:</strong> {String(error?.digest ?? "")}
      </p>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          background: "#f5f5f4",
          padding: 12,
          borderRadius: 8,
          marginTop: 12,
          maxHeight: 400,
          overflow: "auto",
        }}
      >
        {String(error?.stack ?? "")}
      </pre>
      <button
        onClick={() => reset()}
        style={{
          marginTop: 12,
          padding: "8px 16px",
          background: "#047857",
          color: "#fff",
          borderRadius: 8,
        }}
      >
        Try again
      </button>
    </div>
  );
}
