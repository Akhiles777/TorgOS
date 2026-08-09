import Link from "next/link";
import { requireSuperAdmin } from "@/server/superAdminGuard";
import { listOrganizations } from "@/server/services/rootAdmin";
import { RootShell } from "@/components/root/RootShell";
import type { SubscriptionStatus } from "@prisma/client";
import { OrgFilters } from "./OrgFilters";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: "Триал", ACTIVE: "Активна", PAST_DUE: "Просрочена", CANCELLED: "Отменена", SUSPENDED: "Приостановлена",
};
const STATUSES = Object.keys(STATUS_LABEL) as SubscriptionStatus[];

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sa = await requireSuperAdmin();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as SubscriptionStatus) ? (sp.status as SubscriptionStatus) : undefined;
  const orgs = await listOrganizations(sp.q, status);

  return (
    <RootShell active="/root/organizations" adminName={sa.name}>
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-semibold">Организации <span className="text-ink-soft font-normal">· {orgs.length}</span></h1>
      </div>

      <OrgFilters initialQuery={sp.q ?? ""} initialStatus={sp.status ?? ""} statuses={STATUSES} statusLabel={STATUS_LABEL} />

      <div className="border border-line rounded-tag overflow-x-auto mt-3">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-paper-2 text-ink-soft text-left">
              <th className="px-3 py-1.5 font-medium">Организация</th>
              <th className="px-3 py-1.5 font-medium">Тариф</th>
              <th className="px-3 py-1.5 font-medium">Статус</th>
              <th className="px-3 py-1.5 font-medium text-right">Триал до</th>
              <th className="px-3 py-1.5 font-medium text-right">Точек</th>
              <th className="px-3 py-1.5 font-medium text-right">Юзеров</th>
              <th className="px-3 py-1.5 font-medium text-right">Создана</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-soft">Ничего не найдено.</td>
              </tr>
            ) : (
              orgs.map((o) => (
                <tr key={o.id} className="border-t border-line hover:bg-paper-2/60">
                  <td className="px-3 py-1.5">
                    <Link href={`/root/organizations/${o.id}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-ink-soft">{o.plan}</td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={o.subscriptionStatus} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-app-mono text-ink-soft">
                    {o.trialEndsAt ? new Date(o.trialEndsAt).toLocaleDateString("ru-RU") : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-app-mono">{o.storeCount}</td>
                  <td className="px-3 py-1.5 text-right font-app-mono">{o.userCount}</td>
                  <td className="px-3 py-1.5 text-right font-app-mono text-ink-soft">{new Date(o.createdAt).toLocaleDateString("ru-RU")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </RootShell>
  );
}

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const tone: Record<SubscriptionStatus, string> = {
    TRIAL: "text-ink-soft",
    ACTIVE: "text-fresh-text",
    PAST_DUE: "text-warn-text",
    CANCELLED: "text-ink-soft",
    SUSPENDED: "text-stamp-text",
  };
  return <span className={`text-xs font-medium ${tone[status]}`}>{STATUS_LABEL[status]}</span>;
}
