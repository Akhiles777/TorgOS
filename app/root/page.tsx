import Link from "next/link";
import { requireSuperAdmin } from "@/server/superAdminGuard";
import { dashboardStats } from "@/server/services/rootAdmin";
import { RootShell } from "@/components/root/RootShell";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Триал", ACTIVE: "Активна", PAST_DUE: "Просрочена", CANCELLED: "Отменена", SUSPENDED: "Приостановлена",
};

export default async function RootDashboardPage() {
  const sa = await requireSuperAdmin();
  const stats = await dashboardStats();

  return (
    <RootShell active="/root" adminName={sa.name}>
      <h1 className="text-lg font-semibold mb-4">Дашборд</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line border border-line rounded-tag overflow-hidden mb-6">
        <Metric label="Организаций" value={stats.totalOrgs} />
        <Metric label="Пользователей" value={stats.totalUsers} />
        <Metric label="Точек" value={stats.totalStores} />
        {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((s) => (
          <Metric key={s} label={STATUS_LABEL[s]} value={stats.statusCounts[s as keyof typeof stats.statusCounts]} />
        ))}
      </div>

      <h2 className="text-sm font-semibold text-ink-soft mb-2">Последние регистрации</h2>
      <div className="border border-line rounded-tag overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-paper-2 text-ink-soft text-left">
              <th className="px-3 py-1.5 font-medium">Организация</th>
              <th className="px-3 py-1.5 font-medium">Тип</th>
              <th className="px-3 py-1.5 font-medium text-right">Создана</th>
            </tr>
          </thead>
          <tbody>
            {stats.recent.map((o) => (
              <tr key={o.id} className="border-t border-line hover:bg-paper-2/60">
                <td className="px-3 py-1.5">
                  <Link href={`/root/organizations/${o.id}`} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-ink-soft">{o.type === "RETAIL" ? "Магазин" : "Общепит"}</td>
                <td className="px-3 py-1.5 text-right font-app-mono text-ink-soft">{new Date(o.createdAt).toLocaleDateString("ru-RU")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RootShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper px-3 py-2.5">
      <div className="text-[11px] text-ink-soft uppercase tracking-wide">{label}</div>
      <div className="font-app-mono text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
