"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { Alert, Button, Card, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(255),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  role: z.enum(["client", "provider", "fleet_owner"]),
});

const ROLE_DASHBOARD: Record<string, string> = {
  client: "/dashboard/client",
  provider: "/dashboard/provider",
  fleet_owner: "/dashboard/fleet",
};

function SignUpForm() {
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("client");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const parsed = clientSchema.safeParse({ name, email, password, role });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setServerError(body?.error ?? "Couldn't create your account. Please try again.");
        setSubmitting(false);
        return;
      }
      // Account created — sign in immediately with the new credentials.
      const callbackUrl = searchParams.get("callbackUrl") ?? ROLE_DASHBOARD[parsed.data.role];
      await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, callbackUrl });
      setSubmitting(false);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <PageHeader title="Create your account" subtitle="Book dumpsters, list your trucks, or promote your fleet." />

      {serverError && (
        <div className="mb-4">
          <Alert tone="red">{serverError}</Alert>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="signup-name">
          <Input
            id="signup-name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jordan Rivera"
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name && <p className="mt-1 text-xs text-red-700">{fieldErrors.name}</p>}
        </Field>
        <Field label="Email" htmlFor="signup-email">
          <Input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-red-700">{fieldErrors.email}</p>}
        </Field>
        <Field label="Password" hint="At least 8 characters." htmlFor="signup-password">
          <Input
            id="signup-password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password && <p className="mt-1 text-xs text-red-700">{fieldErrors.password}</p>}
        </Field>
        <Field label="I want to…" htmlFor="signup-role">
          <Select id="signup-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="client">Rent dumpsters (customer)</option>
            <option value="provider">Haul dumpsters (provider)</option>
            <option value="fleet_owner">Manage a container fleet (fleet owner)</option>
          </Select>
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-stone-500">
        Already have an account?{" "}
        <Link href="/signin" className="font-semibold text-emerald-700 hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

export default function SignUpPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={<Spinner label="Loading…" />}>
          <SignUpForm />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
