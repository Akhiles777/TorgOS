import { Suspense } from "react";
import { requireSuperAdmin } from "@/server/superAdminGuard";
import { RootShell } from "@/components/root/RootShell";
import { visitorStats, dailySeries, breakdowns, platformInsightData } from "@/server/services/siteAnalytics";
import { generatePlatformInsights } from "@/server/insights/platform";
import { DailyTrendChart } from "@/components/root/DailyTrendChart";
import { PlatformInsightCard } from "@/components/root/PlatformInsightCard";
import { PlatformBriefingSection, PlatformBriefingSkeleton } from "./PlatformBriefingSection";

export const dynamic = "force-dynamic";

export default async function RootAnalyticsPage() {
  const sa = await requireSuperAdmin();
  const [stats, series, brk, insightInput] = await Promise.all([visitorStats(), dailySeries(30), breakdowns(30), platformInsightData(30)]);
  const insights = generatePlatformInsights(insightInput);

  return (
    <RootShell active="/root/analytics" adminName={sa.name}>
      <h1 className="text-lg font-semibold mb-4">Аналитика лендинга</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line border border-line rounded-tag overflow-hidden mb-6">
        <Metric label="Визитов сегодня" value={stats.today.uniqueVisitors} />
        <Metric label="Визитов за 7 дн" value={stats.last7d.uniqueVisitors} />
        <Metric label="Визитов за 30 дн" value={stats.last30d.uniqueVisitors} />
        <Metric label="Долистали до конца" value={`${stats.last30d.scrollCompletionRate}%`} />
        <Metric label="CTR по CTA" value={`${stats.last30d.ctaCtr}%`} />
        <Metric label="Конверсия в регистрацию" value={`${stats.last30d.conversion}%`} />
      </div>

      {insights.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-ink-soft mb-2">Честные правила</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {insights.map((i, idx) => (
              <PlatformInsightCard key={idx} insight={i} />
            ))}
          </div>
        </div>
      )}

      <Suspense fallback={<PlatformBriefingSkeleton />}>
        <PlatformBriefingSection dashboard={{ windowDays: 30, visitors: stats.last30d, insights }} />
      </Suspense>

      <div className="border border-line rounded-tag p-4 mb-6">
        <h2 className="text-sm font-semibold text-ink-soft mb-3">Визиты и регистрации по дням</h2>
        <DailyTrendChart data={series} />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <BreakdownTable title="Откуда приходят" rows={brk.referrers} />
        <BreakdownTable title="Устройства" rows={brk.devices} />
        <BreakdownTable title="Страницы" rows={brk.topPaths} />
      </div>
    </RootShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-paper px-3 py-2.5">
      <div className="text-[11px] text-ink-soft uppercase tracking-wide">{label}</div>
      <div className="font-app-mono text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="border border-line rounded-tag overflow-hidden">
      <div className="bg-paper-2 px-3 py-1.5 text-sm font-medium text-ink-soft">{title}</div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-sm text-ink-soft">Нет данных за период</div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 text-right font-app-mono text-ink-soft">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
