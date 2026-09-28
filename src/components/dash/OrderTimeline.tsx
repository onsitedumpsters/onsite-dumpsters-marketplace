import { STATUS_LABELS, type OrderStatus } from "@/lib/order-machine";

export interface TimelineEvent {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: string | null;
  actorName?: string | null;
  note: string | null;
  createdAt: string | Date;
}

/** Vertical order tracking timeline, built from OrderEvent rows (BUILD_SPEC §5). */
export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  if (sorted.length === 0) {
    return <p className="text-sm text-stone-500">No events recorded yet.</p>;
  }
  return (
    <ol className="relative space-y-6 border-l-2 border-emerald-200 pl-0" aria-label="Order timeline">
      {sorted.map((e) => (
        <li key={e.id} className="relative pl-8">
          <span
            aria-hidden
            className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-emerald-700 bg-white"
          />
          <p className="text-sm font-semibold text-stone-900">
            {STATUS_LABELS[e.toStatus] ?? e.toStatus}
          </p>
          <p className="text-xs text-stone-500">
            {new Date(e.createdAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {e.actorRole ? ` · ${e.actorRole}` : ""}
            {e.actorName ? ` (${e.actorName})` : ""}
          </p>
          {e.note && <p className="mt-1 text-sm text-stone-600">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
