"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface CategoryCount {
  category: string;
  orders: number;
}

function prettyCategory(code: string) {
  return code.replace(/_/g, " ");
}

interface TooltipEntry {
  value?: number | string;
}

function OrdersTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-stone-800">{prettyCategory(String(label ?? ""))}</p>
      <p className="text-stone-600">{Number(payload[0]?.value ?? 0)} orders</p>
    </div>
  );
}

export function OrdersBarChart({ data }: { data: CategoryCount[] }) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-stone-500">No orders yet.</p>;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={120}
            tickFormatter={prettyCategory}
          />
          <Tooltip content={<OrdersTooltip />} />
          <Bar dataKey="orders" fill="#0d6b46" radius={[0, 4, 4, 0]} name="Orders" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
