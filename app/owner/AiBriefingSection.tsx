import { getAiBriefing } from "@/server/insights/ai";
import type { TenantDb } from "@/server/tenant";
import type { OwnerDashboard } from "@/server/services/analytics";
import { refreshAiBriefingAction } from "./actions";

// Асинхронный Server Component, стримится через <Suspense> в page.tsx —
// медленный или упавший вызов RouterAI не блокирует рендер остальных цифр.
export async function AiBriefingSection({
  db,
  organizationId,
  dashboard,
}: {
  db: TenantDb;
  organizationId: string;
  dashboard: OwnerDashboard;
}) {
  const briefing = await getAiBriefing(db, organizationId, dashboard);

  if (!briefing) {
    // Ключ не задан, сеть недоступна, кеша тоже нет — тихо ничего не показываем.
    // Честные правила выше работают независимо и не пострадали.
    return null;
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold">Сводка от ИИ</h2>
          <span className="text-xs text-ink-soft">
            {briefing.stale ? "прошлая версия, обновление не удалось" : `обновлено ${timeAgo(briefing.generatedAt)}`}
          </span>
        </div>
        <form action={refreshAiBriefingAction}>
          <button type="submit" className="text-xs text-ink-soft hover:text-stamp underline underline-offset-2">
            Обновить
          </button>
        </form>
      </div>
      <div className="relative bg-paper-2 border border-line rounded-tag pl-6 pr-4 py-3">
        <span className="absolute left-2 top-4 w-2.5 h-2.5 rounded-full bg-paper border border-line" aria-hidden />
        <p className="text-sm leading-relaxed whitespace-pre-line">{briefing.content}</p>
      </div>
    </section>
  );
}

export function AiBriefingSkeleton() {
  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="font-semibold">Сводка от ИИ</h2>
        <span className="text-xs text-ink-soft">считаю…</span>
      </div>
      <div className="bg-paper-2 border border-line rounded-tag p-4 space-y-2 animate-pulse">
        <div className="h-3 bg-line/60 rounded w-full" />
        <div className="h-3 bg-line/60 rounded w-5/6" />
        <div className="h-3 bg-line/60 rounded w-2/3" />
      </div>
    </section>
  );
}

function timeAgo(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  return `${h} ч назад`;
}
