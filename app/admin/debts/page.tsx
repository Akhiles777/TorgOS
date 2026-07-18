import { requireStoreScope } from "@/server/guard";
import { listDebts } from "@/server/services/debts";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { DebtsList } from "./DebtsList";
import { money0, plural } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const { user, db, storeId } = await requireStoreScope("ADMIN", "OWNER");
  const { rows, openTotal, openCount } = await listDebts(db, storeId, true);

  return (
    <AppShell role={user.role} userName={user.name} active="admin">
      <AdminTabs />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <h1 className="text-xl font-semibold">Долги</h1>
        <span className="text-ink-soft text-sm">
          {openCount > 0 ? `${openCount} ${plural(openCount, "открытый долг", "открытых долга", "открытых долгов")} на ${money0(openTotal)} ₽` : "открытых долгов нет"}
        </span>
      </div>
      <DebtsList rows={rows} />
    </AppShell>
  );
}
