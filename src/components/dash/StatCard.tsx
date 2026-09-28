import { Card } from "@/components/ui";
import { cn } from "@/components/utils";

/** KPI stat card for dashboard overviews. */
export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
}) {
  const accents = {
    neutral: "border-l-stone-300",
    green: "border-l-emerald-600",
    amber: "border-l-amber-500",
    red: "border-l-red-600",
    blue: "border-l-sky-600",
  } as const;
  return (
    <Card className={cn("border-l-4", accents[tone])}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-stone-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </Card>
  );
}
