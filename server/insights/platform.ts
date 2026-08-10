// Честные правила без ИИ — платформенный аналог generateInsights() (см.
// server/insights/index.ts): тот же контракт (вход → Insight[]), но про
// здоровье SaaS в целом, а не про товары одной организации. Insight.productId
// здесь просто не проставляется — поле уже опционально в общем типе.
import type { Insight } from "./index";

// Пороги вынесены как экспорты — server/services/siteAnalytics.ts использует
// те же числа при сборке PlatformInsightInput, чтобы не разъезжались.
export const INACTIVE_DAYS = 14; // порог «активная организация без продаж N дней»
export const ONBOARDING_GRACE_DAYS = 2; // не считаем застрявшими в первые пару дней триала

export type PlatformInsightInput = {
  windowDays: number;
  scrollCompletionThisWeek: number; // % сессий, дошедших до конца, за последние 7 дней
  scrollCompletionLastWeek: number; // тот же % за предыдущие 7 дней
  ctaClicksWindow: number;
  signupsWindow: number;
  trialToPaidRecent: { converted: number; total: number }; // когорта: созданы 30-60 дней назад
  trialToPaidOlder: { converted: number; total: number }; // когорта: созданы 60-90 дней назад
  stuckOnboarding: { orgName: string; daysSinceSignup: number }[]; // триал, ноль товаров, старше ONBOARDING_GRACE_DAYS
  inactivePaying: { orgName: string; daysSinceLastSale: number | null }[]; // ACTIVE, без продаж INACTIVE_DAYS+
};

export function generatePlatformInsights(input: PlatformInsightInput): Insight[] {
  const out: Insight[] = [];

  // 1. Тренд долистывания лендинга
  const { scrollCompletionThisWeek: cur, scrollCompletionLastWeek: prev } = input;
  if (prev > 0 || cur > 0) {
    const drop = prev - cur;
    if (drop >= 5) {
      out.push({
        severity: drop >= 15 ? "danger" : "warn",
        title: "Меньше долистывают лендинг до конца",
        body: `На прошлой неделе до конца долистывало ${prev.toFixed(0)}% посетителей, на этой — ${cur.toFixed(0)}%. Стоит посмотреть, не стало ли что-то отталкивать раньше, чем человек доходит до тарифов.`,
        metric: `${cur.toFixed(0)}% (было ${prev.toFixed(0)}%)`,
      });
    } else if (cur > 0 && cur < 15) {
      out.push({
        severity: "info",
        title: "Немногие долистывают лендинг до конца",
        body: `До конца страницы доходит ${cur.toFixed(0)}% посетителей. Если решение о регистрации завязано на то, что ниже (тарифы, FAQ) — часть аудитории его просто не видит.`,
        metric: `${cur.toFixed(0)}% долистывают`,
      });
    }
  }

  // 2. CTA-клики рядом с регистрациями — намеренно два числа, не «X% конверсии
  // кликнувших»: у нас нет связи анонимного клика с конкретной регистрацией.
  if (input.ctaClicksWindow > 0) {
    out.push({
      severity: "info",
      title: "Клики «Начать бесплатно» и регистрации",
      body: `За ${input.windowDays} дн: ${input.ctaClicksWindow} кликов по кнопке «Начать бесплатно», ${input.signupsWindow} новых регистраций за тот же период. Это не пошаговая воронка одного посетителя — просто два числа рядом, для общего ощущения масштаба.`,
      metric: `${input.ctaClicksWindow} кликов / ${input.signupsWindow} регистраций`,
    });
  }

  // 3. Тренд конверсии триал → оплата
  const rate = (c: { converted: number; total: number }) => (c.total > 0 ? c.converted / c.total : null);
  const recentRate = rate(input.trialToPaidRecent);
  const olderRate = rate(input.trialToPaidOlder);
  if (recentRate !== null && olderRate !== null) {
    const dropPct = (olderRate - recentRate) * 100;
    if (dropPct >= 10) {
      out.push({
        severity: dropPct >= 25 ? "danger" : "warn",
        title: "Ниже конверсия из триала в оплату",
        body: `Из организаций, созданных 60-90 дней назад, до оплаты дошло ${(olderRate * 100).toFixed(0)}%. Из тех, что созданы 30-60 дней назад — пока ${(recentRate * 100).toFixed(0)}% (за меньшее время, часть ещё может дозреть, но разрыв стоит держать в поле зрения).`,
        metric: `${(recentRate * 100).toFixed(0)}% (было ${(olderRate * 100).toFixed(0)}%)`,
      });
    }
  }

  // 4. Застряли на старте — есть аккаунт, ноль товаров
  if (input.stuckOnboarding.length > 0) {
    const n = input.stuckOnboarding.length;
    out.push({
      severity: n >= 5 ? "danger" : "warn",
      title: "Организации застряли на старте",
      body: `${n} организаций в триале старше ${ONBOARDING_GRACE_DAYS} дн так и не завели ни одного товара: ${input.stuckOnboarding
        .slice(0, 5)
        .map((o) => o.orgName)
        .join(", ")}${n > 5 ? " и другие" : ""}. Возможно, стоит написать и предложить помощь с первым запуском.`,
      metric: `${n} без единого товара`,
    });
  }

  // 5. Платят, но не пользуются
  if (input.inactivePaying.length > 0) {
    const n = input.inactivePaying.length;
    out.push({
      severity: "warn",
      title: "Оплаченные организации без продаж",
      body: `${n} организаций с активной подпиской не пробили ни одного чека ${INACTIVE_DAYS}+ дней: ${input.inactivePaying
        .slice(0, 5)
        .map((o) => o.orgName)
        .join(", ")}${n > 5 ? " и другие" : ""}. Риск, что откажутся продлевать — стоит узнать, что случилось.`,
      metric: `${n} организаций`,
    });
  }

  const rank: Record<Insight["severity"], number> = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
