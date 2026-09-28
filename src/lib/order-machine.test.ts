// Tests for the order fulfillment state machine (BUILD_SPEC §5, src/lib/order-machine.ts).
import { describe, it, expect } from "vitest";
import {
  canTransition,
  mayTransition,
  allowedTransitions,
  TRANSITION_ROLES,
  TERMINAL_STATUSES,
} from "./order-machine";

const HAPPY_PATH = [
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
] as const;

describe("happy path", () => {
  it("every forward step quote → … → reviewed is allowed", () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i++) {
      expect(canTransition(HAPPY_PATH[i], HAPPY_PATH[i + 1])).toBe(true);
    }
  });
});

describe("illegal transitions", () => {
  it("quote cannot jump straight to delivered", () => {
    expect(canTransition("quote", "delivered")).toBe(false);
  });

  it("completed cannot go back to booked", () => {
    expect(canTransition("completed", "booked")).toBe(false);
  });

  it("reviewed is terminal with no outgoing transitions", () => {
    expect(TERMINAL_STATUSES).toContain("reviewed");
    expect(TERMINAL_STATUSES).toContain("cancelled");
    expect(allowedTransitions("reviewed")).toEqual([]);
    expect(allowedTransitions("cancelled")).toEqual([]);
    expect(canTransition("reviewed", "booked")).toBe(false);
    expect(canTransition("cancelled", "disputed")).toBe(false);
  });

  it("delivered cannot be cancelled (only disputed)", () => {
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("delivered", "disputed")).toBe(true);
  });
});

describe("disputed re-entry", () => {
  it("admin may return a dispute to delivered", () => {
    expect(mayTransition("disputed", "delivered", "admin")).toBe(true);
  });

  it("provider may NOT return a dispute to delivered", () => {
    expect(mayTransition("disputed", "delivered", "provider")).toBe(false);
  });

  it("client may NOT return a dispute to delivered", () => {
    expect(mayTransition("disputed", "delivered", "client")).toBe(false);
  });

  it("disputed may only be resolved by admin, to a valid prior state", () => {
    for (const to of [
      "booked",
      "accepted",
      "dispatched",
      "delivered",
      "in_service",
      "pickup_scheduled",
      "picked_up",
      "cancelled",
    ] as const) {
      expect(canTransition("disputed", to)).toBe(true);
      expect(mayTransition("disputed", to, "admin")).toBe(true);
      expect(mayTransition("disputed", to, "provider")).toBe(false);
    }
  });
});

describe("TRANSITION_ROLES", () => {
  it("booked → accepted: provider yes, client no", () => {
    expect(TRANSITION_ROLES["booked->accepted"]).toContain("provider");
    expect(mayTransition("booked", "accepted", "provider")).toBe(true);
    expect(mayTransition("booked", "accepted", "client")).toBe(false);
  });

  it("dispatched → delivered requires the delivery role (provider yes, client no)", () => {
    expect(TRANSITION_ROLES["dispatched->delivered"]).toContain("provider");
    expect(mayTransition("dispatched", "delivered", "provider")).toBe(true);
    expect(mayTransition("dispatched", "delivered", "client")).toBe(false);
  });

  it("quote → booked: client yes, provider no", () => {
    expect(mayTransition("quote", "booked", "client")).toBe(true);
    expect(mayTransition("quote", "booked", "provider")).toBe(false);
  });

  it("completed → reviewed: client yes, provider no", () => {
    expect(mayTransition("completed", "reviewed", "client")).toBe(true);
    expect(mayTransition("completed", "reviewed", "provider")).toBe(false);
  });
});
