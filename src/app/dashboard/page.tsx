import { redirect } from "next/navigation";
import { getSession, sessionRole } from "@/lib/server-auth";

/** Role home: bounce each role to its own dashboard landing page. */
export default async function DashboardHome() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const role = sessionRole(session);

  switch (role) {
    case "provider":
      redirect("/dashboard/provider");
    case "fleet_owner":
      redirect("/dashboard/fleet");
    case "admin":
      redirect("/admin");
    case "client":
    default:
      redirect("/dashboard/client/orders");
  }
}
