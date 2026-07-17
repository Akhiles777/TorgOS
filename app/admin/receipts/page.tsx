import { requireStoreScope } from "@/server/guard";
import { listReceiptsForDay } from "@/server/services/receipts";
import { AppShell } from "@/components/AppShell";
import { AdminTabs } from "../AdminTabs";
import { ReceiptsList } from "./ReceiptsList";
import { money0 } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const { user, db, storeId } = await requireStoreScope("ADMIN", "OWNER");
  const { rows, totals } = await listReceiptsForDay(db, storeId);

  return (
    <AppShell role={user.role} userName={user.name} active="admin">
      <AdminTabs />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <h1 className="text-xl font-semibold">Чеки за сегодня</h1>
        <span className="text-ink-soft text-sm">{totals.count} чеков · {money0(totals.sum)} ₽</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-5 max-w-md">
        <Mini label="Наличные" value={totals.CASH} />
        <Mini label="Карта" value={totals.CARD} />
        <Mini label="Перевод" value={totals.TRANSFER} />
      </div>
      <ReceiptsList rows={rows} />
    </AppShell>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper-2 border border-line rounded-tag px-3 py-2">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="font-mono-nums font-semibold">{money0(value)}</div>
    </div>
  );
}
