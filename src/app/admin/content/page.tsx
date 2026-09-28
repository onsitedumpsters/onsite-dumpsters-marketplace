"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Spinner,
  Textarea,
} from "@/components/ui";
import { CATEGORIES, FLORIDA_CITIES } from "@/lib/cities";

interface ContentPage {
  id: string;
  key: string;
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  faqJson: Array<{ q: string; a: string }> | null;
  updatedAt: string;
}

interface KeyOption {
  key: string;
  label: string;
  group: string;
}

const KEY_OPTIONS: KeyOption[] = [
  { key: "home", label: "Homepage (/)", group: "Site" },
  ...CATEGORIES.map((c) => ({
    key: `category:${c.slug}`,
    label: `${c.name} (/categories/${c.slug})`,
    group: "Categories",
  })),
  ...FLORIDA_CITIES.map((c) => ({
    key: `city:${c.slug}`,
    label: `${c.name}, ${c.state} (/cities/${c.slug})`,
    group: "Cities",
  })),
];

const EMPTY_FORM = {
  title: "",
  metaDescription: "",
  h1: "",
  intro: "",
  faqText: "",
};

function faqToText(faq: Array<{ q: string; a: string }> | null): string {
  if (!faq || faq.length === 0) return "";
  return faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
}

function textToFaq(text: string): Array<{ q: string; a: string }> {
  const items: Array<{ q: string; a: string }> = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim());
    const qLine = lines.find((l) => /^q:/i.test(l));
    const aLine = lines.find((l) => /^a:/i.test(l));
    if (qLine && aLine) {
      items.push({
        q: qLine.replace(/^q:\s*/i, ""),
        a: aLine.replace(/^a:\s*/i, ""),
      });
    }
  }
  return items;
}

export default function AdminContentPage() {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("home");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const byKey = useMemo(() => new Map(pages.map((p) => [p.key, p])), [pages]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/content");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to load content pages");
      setPages(d.pages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load content pages");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Populate the editor whenever the selection or data changes.
  useEffect(() => {
    const existing = byKey.get(selectedKey);
    if (existing) {
      setForm({
        title: existing.title,
        metaDescription: existing.metaDescription,
        h1: existing.h1,
        intro: existing.intro,
        faqText: faqToText(existing.faqJson),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setNotice(null);
    setError(null);
  }, [selectedKey, byKey]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selectedKey,
          title: form.title,
          metaDescription: form.metaDescription,
          h1: form.h1,
          intro: form.intro,
          faq: textToFaq(form.faqText),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to save");
      setNotice(`Saved override for ${selectedKey}. It is live on the site now.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!byKey.get(selectedKey)) return;
    if (!window.confirm(`Delete the custom content for ${selectedKey} and restore defaults?`)) return;
    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch(`/api/admin/content?key=${encodeURIComponent(selectedKey)}`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to reset");
      setNotice(`Reset ${selectedKey} to defaults.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setResetting(false);
    }
  }

  const groups = useMemo(() => {
    const out: Array<{ name: string; options: KeyOption[] }> = [];
    for (const opt of KEY_OPTIONS) {
      let g = out.find((x) => x.name === opt.group);
      if (!g) {
        g = { name: opt.group, options: [] };
        out.push(g);
      }
      g.options.push(opt);
    }
    return out;
  }, []);

  return (
    <div>
      <PageHeader
        title="Content & SEO"
        subtitle="Override the title, meta description, headline, intro copy, and FAQs for public landing pages. Pages without an override use the built-in defaults."
      />

      {error && (
        <div className="mb-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="green">{notice}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Pages</h2>
          {loading ? (
            <Spinner />
          ) : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.name}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    {g.name}
                  </p>
                  <ul className="space-y-1">
                    {g.options.map((opt) => {
                      const customized = byKey.has(opt.key);
                      const active = opt.key === selectedKey;
                      return (
                        <li key={opt.key}>
                          <button
                            type="button"
                            onClick={() => setSelectedKey(opt.key)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                              active
                                ? "bg-emerald-100 text-emerald-900"
                                : "text-stone-700 hover:bg-stone-100"
                            }`}
                          >
                            <span className="truncate">{opt.label}</span>
                            {customized && (
                              <Badge tone="green">Custom</Badge>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-stone-900">
                Editing: <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm">{selectedKey}</code>
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                {byKey.has(selectedKey)
                  ? `Customized — last updated ${new Date(byKey.get(selectedKey)!.updatedAt).toLocaleString()}`
                  : "Using built-in defaults — save to create a custom override."}
              </p>
            </div>
            {byKey.has(selectedKey) && (
              <Button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="bg-stone-200 text-stone-800 hover:bg-stone-300"
              >
                {resetting ? "Resetting…" : "Reset to defaults"}
              </Button>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Page title (SEO)" hint="Shown in the browser tab and search results. Keep under 60 characters.">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                maxLength={160}
                placeholder="e.g. 20-Yard Dumpster Rental in Orlando, FL — Compare Total Prices"
              />
            </Field>
            <Field label="Meta description" hint="Search-result snippet. Keep under 160 characters.">
              <Textarea
                value={form.metaDescription}
                onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                rows={2}
                maxLength={320}
                placeholder="One or two sentences summarizing the page."
              />
            </Field>
            <Field label="Headline (H1)" hint="The main on-page heading. Leave blank to keep the default.">
              <Input
                value={form.h1}
                onChange={(e) => setForm({ ...form, h1: e.target.value })}
                maxLength={160}
                placeholder="Defaults to the standard headline"
              />
            </Field>
            <Field label="Intro copy" hint="The paragraph under the headline. Leave blank to keep the default.">
              <Textarea
                value={form.intro}
                onChange={(e) => setForm({ ...form, intro: e.target.value })}
                rows={4}
                maxLength={5000}
                placeholder="Defaults to the standard intro paragraph"
              />
            </Field>
            <Field
              label="FAQs"
              hint="One block per FAQ, separated by a blank line. Format: Q: … on one line, A: … on the next. Replaces the default FAQ set (and its FAQPage schema) when non-empty."
            >
              <Textarea
                value={form.faqText}
                onChange={(e) => setForm({ ...form, faqText: e.target.value })}
                rows={8}
                placeholder={"Q: How much does a 20-yard dumpster cost?\nA: Every listing shows one total price…\n\nQ: Do I need a permit?\nA: Driveway placement usually needs no permit…"}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save override"}
              </Button>
              <p className="text-xs text-stone-500">
                Changes go live immediately on the public page.
              </p>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
