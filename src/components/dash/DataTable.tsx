import type { ReactNode } from "react";
import { cn } from "@/components/utils";

export interface Column<T> {
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

/** Minimal responsive data table (horizontal scroll on small screens). */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  emptyTitle = "Nothing here yet",
  emptyBody,
}: {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
        <p className="font-semibold text-stone-800">{emptyTitle}</p>
        {emptyBody && <p className="mx-auto mt-1 max-w-md text-sm text-stone-500">{emptyBody}</p>}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={cn(
                  "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-stone-500",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
              {columns.map((c) => (
                <td key={c.header} className={cn("px-4 py-3 align-top", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
