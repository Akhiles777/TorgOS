import { requireSuperAdmin } from "@/server/superAdminGuard";
import { listAuditLog } from "@/server/services/rootAdmin";
import { RootShell } from "@/components/root/RootShell";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  plan_change: "смена тарифа",
  trial_extend: "продление триала",
  status_change: "смена статуса",
  org_delete: "удаление организации",
  password_reset: "сброс пароля",
  impersonate_start: "вход как пользователь",
  impersonate_end: "выход из подмены",
};

export default async function RootAuditPage() {
  const sa = await requireSuperAdmin();
  const rows = await listAuditLog(150);

  return (
    <RootShell active="/root/audit" adminName={sa.name}>
      <h1 className="text-lg font-semibold mb-1">Аудит-лог</h1>
      <p className="text-xs text-ink-soft mb-4">Только чтение. Последние {rows.length} записей.</p>

      <div className="border border-line rounded-tag overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="bg-paper-2 text-ink-soft text-left">
              <th className="px-3 py-1.5 font-medium">Когда</th>
              <th className="px-3 py-1.5 font-medium">Кто</th>
              <th className="px-3 py-1.5 font-medium">Действие</th>
              <th className="px-3 py-1.5 font-medium">Цель</th>
              <th className="px-3 py-1.5 font-medium">Детали</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-soft">Пока пусто.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-1.5 font-app-mono text-xs text-ink-soft whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{r.superAdminName}</td>
                  <td className="px-3 py-1.5 text-xs font-medium">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="px-3 py-1.5 text-xs text-ink-soft">
                    {r.targetType} <span className="font-app-mono">{r.targetId.slice(0, 8)}…</span>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-ink-soft font-app-mono">
                    {r.meta ? JSON.stringify(r.meta) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </RootShell>
  );
}
