"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RevenueDay {
  /** YYYY-MM-DD */
  date: string;
  /** dollars (converted from cents server-side) */
  booking: number;
  dropping: number;
  processing: number;
  takeRate: number;
}

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

interface RevenueTooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
}

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: RevenueTooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-stone-800">{String(label ?? "")}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-stone-600">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color ?? "#0d6b46" }}
          />
          {String(entry.name ?? "")}: {usd(Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: RevenueDay[] }) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-stone-500">No fee revenue in the last 30 days.</p>;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={usd} tick={{ fontSize: 11 }} tickLine={false} width={64} />
          <Tooltip content={<RevenueTooltip />} />
          <Legend />
          <Area type="monotone" dataKey="booking" stackId="1" stroke="#0d6b46" fill="#0d6b46" fillOpacity={0.7} name="Booking fee" />
          <Area type="monotone" dataKey="dropping" stackId="1" stroke="#d97706" fill="#d97706" fillOpacity={0.6} name="Dropping fee" />
          <Area type="monotone" dataKey="processing" stackId="1" stroke="#0369a1" fill="#0369a1" fillOpacity={0.5} name="Processing fee" />
          <Area type="monotone" dataKey="takeRate" stackId="1" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.5} name="Take rate" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
