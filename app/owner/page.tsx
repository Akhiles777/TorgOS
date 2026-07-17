import { Suspense } from "react";
import { requireRole } from "@/server/guard";
import { ownerDashboard } from "@/server/services/analytics";
import { AppShell } from "@/components/AppShell";
import { money, money0, plural } from "@/lib/format";
import { RevenueBars } from "./RevenueBars";
import { InsightCard } from "./InsightCard";
import { AiBriefingSection, AiBriefingSkeleton } from "./AiBriefingSection";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const { user, db } = await requireRole("OWNER");
  const d = await ownerDashboard(db, 14);

  return (
    <AppShell role={user.role} userName={user.name} active="owner">
      <h1 className="text-2xl font-semibold mb-1">Кабинет владельца</h1>
      <p className="text-ink-soft text-sm mb-5">Сводка за {d.windowDays} дней · считается из реальных чеков</p>

      {/* Сводка — не «KPI-карточки», а строки ценника */}
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat label="Выручка сегодня" value={money0(d.totals.revenueToday)} unit="₽" accent="fresh" />
        <Stat label={`Выручка / ${d.windowDays} дн`} value={money0(d.totals.revenueWindow)} unit="₽" />
        <Stat label="Средний чек" value={money0(d.totals.avgCheck)} unit="₽" />
        <Stat label={`Валовая прибыль / ${d.windowDays} дн`} value={money0(d.totals.marginWindow)} unit="₽" accent="fresh" />
      </section>

      <section className="bg-paper-2 border border-line rounded-tag p-4 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Выручка по дням</h2>
          <span className="text-xs text-ink-soft">{d.totals.salesWindow} {plural(d.totals.salesWindow, "чек", "чека", "чеков")}</span>
        </div>
        <RevenueBars data={d.dailyRevenue} />
      </section>

      {/* Рекомендации ИИ — честные правила на статистике, пусто = ничего не показываем */}
      <section className="mb-6">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="font-semibold">Рекомендации</h2>
          <span className="text-xs text-ink-soft">на основе продаж и остатков</span>
        </div>
        {d.insights.length === 0 ? (
          <p className="text-ink-soft text-sm bg-paper-2 border border-line rounded-tag p-4">
            Пока всё ровно — тревожных сигналов по остаткам, срокам и марже нет.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {d.insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} />
            ))}
          </div>
        )}
      </section>

      {/* ИИ-сводка стримится отдельно: медленный/недоступный RouterAI не блокирует остальные цифры */}
      <Suspense fallback={<AiBriefingSkeleton />}>
        <AiBriefingSection db={db} organizationId={user.organizationId} dashboard={d} />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankTable title="Топ товаров" subtitle="по выручке за период" rows={d.top} />
        <RankTable title="Аутсайдеры" subtitle="меньше всего денег приносят" rows={d.bottom} />
      </div>

      {d.stores.length > 1 && (
        <section className="mt-6">
          <h2 className="font-semibold mb-3">По точкам</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.stores.map((s) => (
              <div key={s.storeId} className="bg-paper-2 border border-line rounded-tag p-4">
                <div className="font-medium">{s.storeName}</div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                  <div><div className="text-ink-soft text-xs">сегодня</div><div className="font-mono-nums">{money0(s.revenueToday)}</div></div>
                  <div><div className="text-ink-soft text-xs">ср. чек</div><div className="font-mono-nums">{money0(s.avgCheck)}</div></div>
                  <div><div className="text-ink-soft text-xs">прибыль</div><div className="font-mono-nums text-fresh">{money0(s.marginWindow)}</div></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: "fresh" }) {
  return (
    <div className="relative bg-paper-2 border border-line rounded-tag pl-6 pr-3 py-3">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-paper border border-line" aria-hidden />
      <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
      <div className={`font-mono-nums font-bold text-2xl tabular-nums mt-0.5 ${accent === "fresh" ? "text-fresh" : ""}`}>
        {value}<span className="text-base text-ink-soft"> {unit}</span>
      </div>
    </div>
  );
}

function RankTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: { id: string; name: string; unit: "PCS" | "KG"; qty: number; revenue: number; margin: number }[] }) {
  return (
    <section className="bg-paper-2 border border-line rounded-tag p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-ink-soft">{subtitle}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-soft text-sm">Нет данных за период.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-baseline gap-2 text-sm">
              <span className="font-mono-nums text-ink-soft w-5 tabular-nums">{i + 1}.</span>
              <span className="font-medium flex-1 truncate">{r.name}</span>
              <span className="font-mono-nums text-ink-soft tabular-nums hidden sm:inline">
                {r.unit === "KG" ? r.qty.toFixed(1) + " кг" : Math.round(r.qty) + " шт"}
              </span>
              <span className="font-mono-nums font-semibold tabular-nums w-24 text-right">{money(r.revenue)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
