"use client";

import { useEffect } from "react";

/**
 * TEMPORARY diagnostic probe (remove after /search crash is fixed).
 * Captures client-side errors and surfaces them in document.title plus a
 * visible banner, so automated browser checks can read the exact message
 * without devtools access.
 */
export function ErrorProbe() {
  useEffect(() => {
    const show = (msg: string) => {
      const short = msg.slice(0, 300);
      try {
        document.title = `CLIENTERR: ${short}`;
      } catch {
        /* noop */
      }
      try {
        let el = document.getElementById("client-err-probe");
        if (!el) {
          el = document.createElement("div");
          el.id = "client-err-probe";
          el.setAttribute(
            "style",
            "position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fff;padding:8px 12px;font:12px monospace;white-space:pre-wrap;word-break:break-all;",
          );
          document.body.prepend(el);
        }
        el.textContent = `CLIENT ERROR: ${short}`;
      } catch {
        /* noop */
      }
    };
    const onError = (e: ErrorEvent) => {
      show(`error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg =
        r instanceof Error ? `${r.name}: ${r.message}\n${r.stack ?? ""}` : String(r);
      show(`unhandledrejection: ${msg}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
