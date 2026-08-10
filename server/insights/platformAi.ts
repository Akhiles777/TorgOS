// ИИ-сводка для супер-админа — платформенный аналог server/insights/ai.ts,
// тот же принцип (честные правила + агрегаты → модель только расставляет
// приоритеты и формулирует, ничего не считает сама). Кеш — не per-организация,
// а singleton (PlatformBriefing.id="platform"), TTL длиннее (6ч вместо 1ч):
// платформенные метрики двигаются медленнее продаж одного магазина, и это
// естественно ограничивает трату на LLM для страницы, которую открывают нечасто.
import { prisma } from "../db";
import { chatComplete, AiUnavailableError } from "../ai/routerai";
import { parseBriefing, type AiBriefingResult } from "./ai";
import type { Insight } from "./index";
import type { WindowStats } from "../services/siteAnalytics";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 часов
const SINGLETON_ID = "platform";

export type PlatformDashboardForAi = {
  windowDays: number;
  visitors: WindowStats; // окно за weekDays (обычно 30 дней)
  insights: Insight[]; // уже сработавшие честные правила (generatePlatformInsights)
};

function buildPlatformPrompt(d: PlatformDashboardForAi): { system: string; user: string } {
  const system =
    "Ты — консультант по росту SaaS-продукта. Тебе дают РЕАЛЬНЫЕ агрегаты по посетителям публичного лендинга " +
    "и организациям на платформе, а также список уже сработавших правил-предупреждений. Не придумывай новые " +
    "цифры — используй ТОЛЬКО данные из сообщения. Расставь приоритеты и сформулируй 2-4 самых важных вывода " +
    "простым деловым русским языком, без канцелярита.\n\n" +
    "Ответь СТРОГО валидным JSON, без markdown-обёртки (без ```), без пояснений до или после — " +
    "только сам JSON-объект вида:\n" +
    '{"headline":"одно предложение — самый главный вывод","points":[{"severity":"danger|warn|info","title":"короткий заголовок","body":"1-2 предложения по делу"}]}\n' +
    "От 1 до 4 элементов в points. Если данных совсем мало — headline так и скажи, а points сделай пустым массивом.";

  const v = d.visitors;
  const rules = d.insights.map((i) => `[${i.severity}] ${i.title} — ${i.body}`).join("\n");

  const user = [
    `Период: ${d.windowDays} дней.`,
    `Уникальных посетителей лендинга: ${v.uniqueVisitors}. Долистали до конца: ${v.scrollCompletionRate}%.`,
    `Кликов по «Начать бесплатно»: ${v.ctaClicks} (${v.ctaCtr}% от посетителей).`,
    `Новых регистраций за период: ${v.signups} (${v.conversion}% от посетителей).`,
    rules ? `Сработавшие правила-предупреждения:\n${rules}` : "Правила-предупреждения не сработали — тревожных сигналов нет.",
  ].join("\n");

  return { system, user };
}

export async function getPlatformAiBriefing(
  dashboard: PlatformDashboardForAi,
  opts: { force?: boolean } = {},
): Promise<AiBriefingResult | null> {
  // Нет визитов за окно — анализировать нечего, не тратим вызов API.
  if (dashboard.visitors.uniqueVisitors === 0) return null;

  const model = process.env.ROUTERAI_MODEL || "anthropic/claude-sonnet-5";
  let cached: { content: string; generatedAt: Date; model: string } | null = null;
  try {
    cached = await prisma.platformBriefing.findUnique({ where: { id: SINGLETON_ID }, select: { content: true, generatedAt: true, model: true } });
  } catch {
    cached = null;
  }

  const fresh = cached && Date.now() - cached.generatedAt.getTime() < TTL_MS;
  if (fresh && !opts.force) return { ...cached!, stale: false };

  try {
    const { system, user } = buildPlatformPrompt(dashboard);
    const content = await chatComplete([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const generatedAt = new Date();
    await prisma.platformBriefing.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, content, model },
      update: { content, model, generatedAt },
    });
    return { content, generatedAt, model, stale: false };
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.error("Platform AI briefing error:", e);
    return cached ? { ...cached, stale: true } : null;
  }
}

export { parseBriefing };
