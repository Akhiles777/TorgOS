import { requireStoreScope } from "@/server/guard";
import { listStaff } from "@/server/services/receipts";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { StaffManager } from "./StaffManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const { user, db, storeId } = await requireStoreScope("ADMIN", "OWNER");
  const staff = await listStaff(db, storeId);
  return (
    <AppShell role={user.role} userName={user.name} active="admin">
      <AdminTabs />
      <StaffManager staff={staff} />
    </AppShell>
  );
}
