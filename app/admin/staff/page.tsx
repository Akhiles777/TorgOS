import { requireStoreScope } from "@/server/guard";
import { listStaff } from "@/server/services/receipts";
import { listEmployees } from "@/server/services/shift";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { StaffManager } from "./StaffManager";
import { EmployeesManager } from "./EmployeesManager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const { user, db, storeId } = await requireStoreScope("ADMIN", "OWNER");
  const [staff, employees] = await Promise.all([listStaff(db, storeId), listEmployees(db, storeId)]);
  return (
    <AppShell role={user.role} userName={user.name} active="admin">
      <AdminTabs />
      <EmployeesManager employees={employees} />
      <div className="h-8" />
      <StaffManager staff={staff} />
    </AppShell>
  );
}
