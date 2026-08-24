import { requireSuperAdmin } from "@/server/superAdminGuard";
import { leadStats, listLeads } from "@/server/services/rootAdmin";
import { RootShell } from "@/components/root/RootShell";
import { LeadsTable } from "./LeadsTable";

export const dynamic = "force-dynamic";

export default async function RootLeadsPage({ searchParams }: { searchParams: Promise<{ venue?: string; city?: string; ready?: string }> }) {
  const sa = await requireSuperAdmin();
  const params = await searchParams;
  const [stats, leads] = await Promise.all([
    leadStats(),
    listLeads({ venueType: params.venue, city: params.city, readyToCall: params.ready === "yes" ? true : params.ready === "no" ? false : undefined }),
  ]);
  return <RootShell active="/root/leads" adminName={sa.name}>
    <h1 className="text-lg font-semibold mb-4">Заявки в лист ожидания</h1>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line rounded-tag overflow-hidden mb-5">
      <Metric label="Всего" value={stats.total} /><Metric label="Готовы к звонку" value={stats.ready} />
      <Metric label="Типы заведений" value={stats.venueTypes.length} /><Metric label="Системы учёта" value={stats.systems.length} />
    </div>
    <div className="grid md:grid-cols-2 gap-4 mb-6 text-xs text-ink-soft">
      <Summary title="По типам" rows={stats.venueTypes} /><Summary title="Чем ведут учёт" rows={stats.systems} />
    </div>
    <form className="flex flex-wrap items-end gap-2 mb-4 text-xs" method="get">
      <label>Тип заведения<select name="venue" defaultValue={params.venue ?? ""} className="block h-9 mt-1 px-2 border border-line bg-paper"><option value="">Все типы</option>{stats.venueTypes.map((row) => <option key={row.name}>{row.name}</option>)}</select></label>
      <label>Город<input name="city" defaultValue={params.city ?? ""} placeholder="Любой город" className="block h-9 mt-1 px-2 border border-line bg-paper" /></label>
      <label>Готовность к звонку<select name="ready" defaultValue={params.ready ?? ""} className="block h-9 mt-1 px-2 border border-line bg-paper"><option value="">Все</option><option value="yes">Готовы</option><option value="no">Не готовы</option></select></label>
      <button className="h-9 px-3 border border-line rounded-tag hover:bg-paper-2">Фильтровать</button>
    </form>
    <LeadsTable leads={leads} />
  </RootShell>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-paper px-3 py-2.5"><div className="text-[11px] text-ink-soft uppercase tracking-wide">{label}</div><div className="font-app-mono text-xl font-semibold">{value}</div></div>; }
function Summary({ title, rows }: { title: string; rows: Array<{ name: string; count: number }> }) { return <div><h2 className="font-semibold text-sm mb-2 text-ink">{title}</h2><div className="flex flex-wrap gap-2">{rows.map((row) => <span key={row.name} className="border border-line rounded-tag px-2 py-1 bg-paper">{row.name}: <b>{row.count}</b></span>)}</div></div>; }