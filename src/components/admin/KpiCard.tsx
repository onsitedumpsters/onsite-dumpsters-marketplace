import { Card } from "@/components/ui";
import { cn } from "@/components/utils";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "green" | "amber" | "red";
}

const toneRing: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  neutral: "",
  green: "border-l-4 border-l-emerald-600",
  amber: "border-l-4 border-l-amber-500",
  red: "border-l-4 border-l-red-600",
};

export function KpiCard({ label, value, sub, tone = "neutral" }: KpiCardProps) {
  return (
    <Card className={cn(toneRing[tone])}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </Card>
  );
}
