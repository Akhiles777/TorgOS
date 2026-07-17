// ИИ-сводка кабинета владельца — надстройка над честными правилами
// (server/insights/index.ts), не замена. Модель НЕ считает ничего сама:
// ей дают уже посчитанные из реальных чеков агрегаты и список сработавших
// правил, и просят только расставить приоритеты и сформулировать понятным
// языком. Кеш на TTL защищает от лишних затрат и медленных ответов;
// при любой ошибке возвращается кеш (если есть) или null — дашборд
// никогда не падает и не показывает выдуманные данные.
import type { TenantDb } from "../tenant";
import { chatComplete, AiUnavailableError } from "../ai/routerai";
import type { OwnerDashboard } from "../services/analytics";
import { money } from "@/lib/format";

const TTL_MS = 60 * 60 * 1000; // час

export type AiBriefingResult = { content: string; generatedAt: Date; stale: boolean; model: string };

function buildPrompt(d: OwnerDashboard): { system: string; user: string } {
  const system =
    "Ты — консультант по розничной торговле. Тебе дают РЕАЛЬНЫЕ агрегаты, посчитанные из чеков магазина, " +
    "и список уже сработавших правил-предупреждений. Твоя задача — не придумывать новые цифры или товары, " +
    "а только расставить приоритеты и сформулировать 2-4 самых важных вывода простым деловым русским языком, " +
    "без канцелярита («Пробить», а не «осуществить транзакцию»). Используй ТОЛЬКО данные из сообщения. " +
    "Если данных мало — так и скажи. Отвечай коротко (100-150 слов), без markdown-заголовков, обычным текстом " +
    "с абзацами или тире, без приветствий и вступлений.";

  const top = d.top.slice(0, 5).map((p) => `${p.name}: ${money(p.revenue)}`).join("; ");
  const bottom = d.bottom.slice(0, 5).map((p) => `${p.name}: ${money(p.revenue)}`).join("; ");
  const rules = d.insights.map((i) => `[${i.severity}] ${i.title} — ${i.body}`).join("\n");

  const user = [
    `Период: ${d.windowDays} дней.`,
    `Выручка сегодня: ${money(d.totals.revenueToday)}. Выручка за период: ${money(d.totals.revenueWindow)}.`,
    `Средний чек: ${money(d.totals.avgCheck)}. Валовая прибыль за период: ${money(d.totals.marginWindow)}.`,
    `Чеков за период: ${d.totals.salesWindow}.`,
    top ? `Топ товаров по выручке: ${top}.` : "",
    bottom ? `Аутсайдеры по выручке: ${bottom}.` : "",
    rules ? `Сработавшие правила-предупреждения:\n${rules}` : "Правила-предупреждения не сработали — тревожных сигналов нет.",
  ].filter(Boolean).join("\n");

  return { system, user };
}

export async function getAiBriefing(
  db: TenantDb,
  organizationId: string,
  dashboard: OwnerDashboard,
  opts: { force?: boolean } = {},
): Promise<AiBriefingResult | null> {
  const model = process.env.ROUTERAI_MODEL || "anthropic/claude-sonnet-5";
  let cached: { content: string; generatedAt: Date; model: string } | null = null;
  try {
    cached = await db.aiBriefing.findUnique({ where: { organizationId }, select: { content: true, generatedAt: true, model: true } });
  } catch {
    cached = null; // кеш недоступен — не критично, просто попробуем сгенерировать заново
  }

  const fresh = cached && Date.now() - cached.generatedAt.getTime() < TTL_MS;
  if (fresh && !opts.force) return { ...cached!, stale: false };

  try {
    const { system, user } = buildPrompt(dashboard);
    const content = await chatComplete([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const generatedAt = new Date();
    await db.aiBriefing.upsert({
      where: { organizationId },
      create: { organizationId, content, model },
      update: { content, model, generatedAt },
    });
    return { content, generatedAt, model, stale: false };
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.error("AI briefing error:", e);
    // Деградация: отдаём старый кеш, если он есть, иначе тихо ничего не показываем
    return cached ? { ...cached, stale: true } : null;
  }
}
