// Order fulfillment state machine — BUILD_SPEC §5.
// quote → booked → accepted → dispatched → delivered → in_service →
// pickup_scheduled → picked_up → completed → reviewed
// Branches: cancelled (from quote/booked/accepted/dispatched), disputed (from
// booked..picked_up). A dispute resolves back to the status it came from.

export const ORDER_STATUSES = [
  "quote",
  "booked",
  "accepted",
  "dispatched",
  "delivered",
  "in_service",
  "pickup_scheduled",
  "picked_up",
  "completed",
  "reviewed",
  "cancelled",
  "disputed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  quote: ["booked", "cancelled"],
  booked: ["accepted", "cancelled", "disputed"],
  accepted: ["dispatched", "cancelled", "disputed"],
  dispatched: ["delivered", "cancelled", "disputed"],
  delivered: ["in_service", "disputed"],
  in_service: ["pickup_scheduled", "disputed"],
  pickup_scheduled: ["picked_up", "disputed"],
  picked_up: ["completed", "disputed"],
  completed: ["reviewed"],
  reviewed: [],
  cancelled: [],
  disputed: ["booked", "accepted", "dispatched", "delivered", "in_service", "pickup_scheduled", "picked_up", "cancelled"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return [...(TRANSITIONS[from] ?? [])];
}

export const TERMINAL_STATUSES: OrderStatus[] = ["reviewed", "cancelled"];
export const ACTIVE_STATUSES: OrderStatus[] = [
  "booked",
  "accepted",
  "dispatched",
  "delivered",
  "in_service",
  "pickup_scheduled",
  "picked_up",
  "completed",
  "disputed",
];

/** Which roles may trigger each transition (server-enforced in API routes). */
export const TRANSITION_ROLES: Partial<Record<string, string[]>> = {
  "quote->booked": ["client", "admin"],
  "quote->cancelled": ["client", "admin"],
  "booked->accepted": ["provider", "admin"],
  "booked->cancelled": ["client", "provider", "admin"],
  "booked->disputed": ["client", "provider", "admin"],
  "accepted->dispatched": ["provider", "admin"],
  "accepted->cancelled": ["client", "provider", "admin"],
  "accepted->disputed": ["client", "provider", "admin"],
  "dispatched->delivered": ["provider", "admin"],
  "dispatched->cancelled": ["provider", "admin"],
  "dispatched->disputed": ["client", "provider", "admin"],
  "delivered->in_service": ["provider", "client", "admin"],
  "delivered->disputed": ["client", "provider", "admin"],
  "in_service->pickup_scheduled": ["client", "provider", "admin"],
  "in_service->disputed": ["client", "provider", "admin"],
  "pickup_scheduled->picked_up": ["provider", "admin"],
  "pickup_scheduled->disputed": ["client", "provider", "admin"],
  "picked_up->completed": ["provider", "admin"],
  "picked_up->disputed": ["client", "provider", "admin"],
  "completed->reviewed": ["client", "admin"],
  "disputed->booked": ["admin"],
  "disputed->accepted": ["admin"],
  "disputed->dispatched": ["admin"],
  "disputed->delivered": ["admin"],
  "disputed->in_service": ["admin"],
  "disputed->pickup_scheduled": ["admin"],
  "disputed->picked_up": ["admin"],
  "disputed->cancelled": ["admin"],
};

export function mayTransition(from: OrderStatus, to: OrderStatus, role: string): boolean {
  if (!canTransition(from, to)) return false;
  const allowed = TRANSITION_ROLES[`${from}->${to}`];
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Human labels for timeline UI. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  quote: "Quote created",
  booked: "Booked — payment authorized (escrow)",
  accepted: "Accepted by hauler",
  dispatched: "Driver dispatched",
  delivered: "Delivered",
  in_service: "In service at your site",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  completed: "Completed — escrow released",
  reviewed: "Reviewed",
  cancelled: "Cancelled",
  disputed: "Under dispute",
};

/** SLA thresholds (hours) — breaches flag admin and affect ranking. */
export const SLA = {
  acceptanceHours: 4,
  disputeResolutionHours: 72,
} as const;
