import { Badge } from "@/components/ui";
import { STATUS_LABELS, type OrderStatus } from "@/lib/order-machine";

const TONES: Record<OrderStatus, "neutral" | "green" | "amber" | "red" | "blue"> = {
  quote: "neutral",
  booked: "blue",
  accepted: "blue",
  dispatched: "amber",
  delivered: "amber",
  in_service: "green",
  pickup_scheduled: "blue",
  picked_up: "amber",
  completed: "green",
  reviewed: "green",
  cancelled: "red",
  disputed: "red",
};

/** Colored status pill for orders, backed by STATUS_LABELS from the state machine. */
export function StatusBadge({ status }: { status: OrderStatus | string }) {
  const key = status as OrderStatus;
  const label = STATUS_LABELS[key] ?? String(status).replace(/_/g, " ");
  const tone = TONES[key] ?? "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}
