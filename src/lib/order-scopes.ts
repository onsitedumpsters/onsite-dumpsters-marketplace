import type { Prisma } from "@prisma/client";
import { sessionRole, sessionUserId, type Session } from "@/lib/server-auth";

/**
 * Role-based order visibility scope.
 * Admins see everything; providers their jobs; fleet owners orders on their
 * containers; clients only their own orders.
 */
export function orderScopeWhere(session: Session): Prisma.OrderWhereInput {
  const role = sessionRole(session);
  const userId = sessionUserId(session);
  if (role === "admin") return {};
  if (role === "provider") return { providerId: userId };
  if (role === "fleet_owner") return { listing: { container: { fleetOwnerId: userId } } };
  return { clientId: userId }; // client default
}
