// ИИ-сводка кабинета владельца — надстройка над честными правилами
// (server/insights/index.ts), не замена. Модель НЕ считает ничего сама:
// ей дают уже посчитанные из реальных чеков агрегаты и список сработавших
// правил, и просят только расставить приоритеты и сформулировать понятным
// языком в строгом JSON (чтобы рендерить как карточки, а не сплошной абзац).
// Кеш на TTL защищает от лишних затрат и медленных ответов; при любой ошибке
// возвращается кеш (если есть) или null — дашборд никогда не падает и не
// показывает выдуманные данные. Для организации без единой реальной продажи
// вызов вообще не делается — нечего анализировать, не тратим ни деньги, ни время.
import type { TenantDb } from "../tenant";
import { chatComplete, AiUnavailableError } from "../ai/routerai";
import type { OwnerDashboard } from "../services/analytics";
import { money } from "@/lib/format";

const TTL_MS = 60 * 60 * 1000; // час

export type AiBriefingResult = { content: string; generatedAt: Date; stale: boolean; model: string };

export type AiBriefingPoint = { severity: "danger" | "warn" | "info"; title: string; body: string };
export type ParsedBriefing = { headline: string; points: AiBriefingPoint[] } | { freeform: string };

// Разбор ответа модели: ожидаем JSON, но старый кеш (до этой доработки) может
// содержать простой текст — такой рендерим как есть, ничего не ломаем.
export function parseBriefing(content: string): ParsedBriefing {
  // Модели иногда оборачивают JSON в ```json ... ``` несмотря на инструкцию не делать этого
  const unwrapped = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const json = JSON.parse(unwrapped);
    if (json && typeof json.headline === "string" && Array.isArray(json.points)) {
      const points: AiBriefingPoint[] = json.points
        .filter((p: unknown): p is Record<string, unknown> => !!p && typeof p === "object")
        .map((p: Record<string, unknown>) => ({
          severity: (["danger", "warn", "info"] as const).includes(p.severity as "danger" | "warn" | "info") ? (p.severity as "danger" | "warn" | "info") : "info",
          title: String(p.title ?? "").slice(0, 120),
          body: String(p.body ?? "").slice(0, 400),
        }))
        .filter((p: AiBriefingPoint) => p.title && p.body)
        .slice(0, 4);
      if (points.length) return { headline: String(json.headline).slice(0, 200), points };
    }
  } catch {
    // не JSON — значит это старый простой текст или модель не справилась с форматом
  }
  return { freeform: content };
}

function buildPrompt(d: OwnerDashboard): { system: string; user: string } {
  const system =
    "Ты — консультант по розничной торговле. Тебе дают РЕАЛЬНЫЕ агрегаты, посчитанные из чеков магазина, " +
    "и список уже сработавших правил-предупреждений. Не придумывай новые цифры или товары — используй ТОЛЬКО " +
    "данные из сообщения. Расставь приоритеты и сформулируй 2-4 самых важных вывода простым деловым русским " +
    "языком, без канцелярита («Пробить», а не «осуществить транзакцию»).\n\n" +
    "Ответь СТРОГО валидным JSON, без markdown-обёртки (без ```), без пояснений до или после — " +
    "только сам JSON-объект вида:\n" +
    '{"headline":"одно предложение — самый главный вывод","points":[{"severity":"danger|warn|info","title":"короткий заголовок","body":"1-2 предложения по делу"}]}\n' +
    "От 1 до 4 элементов в points. Если данных совсем мало — headline так и скажи, а points сделай пустым массивом.";

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
  // Новая организация без единой реальной продажи — анализировать нечего,
  // не тратим вызов API и не показываем пустую/общую болтовню модели.
  if (dashboard.totals.salesWindow === 0) return null;

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
