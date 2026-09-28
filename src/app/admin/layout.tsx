"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/components/utils";

const NAV: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/fees", label: "Fee schedules" },
  { href: "/admin/ledger", label: "Escrow ledger" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/ads", label: "Ads & Promote" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/users", label: "Users" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/admin" className="text-lg font-bold text-emerald-800">
            Onsite Dumpsters <span className="font-normal text-stone-500">· Admin</span>
          </Link>
          <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
            ← Marketplace
          </Link>
        </div>
        <nav className="border-t border-stone-100">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-emerald-700 text-white"
                      : "text-stone-600 hover:bg-emerald-50 hover:text-emerald-800",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
