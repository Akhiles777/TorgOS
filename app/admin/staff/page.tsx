import { redirect } from "next/navigation";
import { requireRole } from "@/server/guard";
import { listStaff } from "@/server/services/receipts";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { StaffManager } from "./StaffManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const { user, db } = await requireRole("ADMIN", "OWNER");
  if (!user.storeId) redirect("/owner");
  const staff = await listStaff(db, user.storeId);
  return (
    <AppShell role={user.role} userName={user.name} active="admin">
      <AdminTabs />
      <StaffManager staff={staff} />
    </AppShell>
  );
}
