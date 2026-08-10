// Аналитика анонимных посетителей лендинга — как и rootAdmin.ts, сырой prisma
// (SiteEvent/PlatformBriefing не проходят через tenantDb, см. server/tenant.ts:
// у анонимного посетителя нет organizationId, изолировать по нему нечего).
import { prisma } from "../db";
import type { SiteEventType } from "@prisma/client";
import { INACTIVE_DAYS, ONBOARDING_GRACE_DAYS, type PlatformInsightInput } from "../insights/platform";

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sinceDaysAgo(days: number): Date {
  return new Date(startOfDay(new Date()).getTime() - (days - 1) * DAY_MS);
}

type RawEvent = { type: SiteEventType; sessionId: string; createdAt: Date };
type RawOrg = { createdAt: Date };

async function loadRawWindow(days: number): Promise<{ since: Date; events: RawEvent[]; orgs: RawOrg[] }> {
  const since = sinceDaysAgo(days);
  const [events, orgs] = await Promise.all([
    prisma.siteEvent.findMany({ where: { createdAt: { gte: since } }, select: { type: true, sessionId: true, createdAt: true } }),
    prisma.organization.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);
  return { since, events, orgs };
}

export type WindowStats = {
  uniqueVisitors: number;
  scrollCompletionRate: number; // % сессий, дошедших до SCROLL_100
  ctaClicks: number; // уникальные сессии, кликнувшие хоть один CTA
  ctaCtr: number; // % от uniqueVisitors
  signups: number;
  conversion: number; // % от uniqueVisitors — НЕ пошаговая воронка одного человека,
  // это два параллельных числа за один период (идентичность анонимна, не связана
  // с реальной регистрацией — см. отчёт по фиче).
};

function computeWindow(events: RawEvent[], signups: number): WindowStats {
  const pv = new Set(events.filter((e) => e.type === "PAGEVIEW").map((e) => e.sessionId));
  const s100 = new Set(events.filter((e) => e.type === "SCROLL_100").map((e) => e.sessionId));
  const cta = new Set(events.filter((e) => e.type === "CTA_CLICK").map((e) => e.sessionId));
  const uniqueVisitors = pv.size;
  const pct = (n: number) => (uniqueVisitors ? Math.round((n / uniqueVisitors) * 1000) / 10 : 0);
  return {
    uniqueVisitors,
    scrollCompletionRate: pct(s100.size),
    ctaClicks: cta.size,
    ctaCtr: pct(cta.size),
    signups,
    conversion: pct(signups),
  };
}

export async function visitorStats(): Promise<{ today: WindowStats; last7d: WindowStats; last30d: WindowStats }> {
  const { events, orgs } = await loadRawWindow(30);
  const forWindow = (days: number): WindowStats => {
    const since = sinceDaysAgo(days);
    return computeWindow(
      events.filter((e) => e.createdAt >= since),
      orgs.filter((o) => o.createdAt >= since).length,
    );
  };
  return { today: forWindow(1), last7d: forWindow(7), last30d: forWindow(30) };
}

export async function funnelStats(days = 30): Promise<WindowStats> {
  const { events, orgs } = await loadRawWindow(days);
  return computeWindow(events, orgs.length);
}

export type DailyPoint = { date: string; visits: number; ctaClicks: number; signups: number };

export async function dailySeries(days = 30): Promise<DailyPoint[]> {
  const { events, orgs } = await loadRawWindow(days);

  const visitsByDay = new Map<string, Set<string>>();
  const ctaByDay = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type !== "PAGEVIEW" && e.type !== "CTA_CLICK") continue;
    const key = dayKey(e.createdAt);
    const bucket = e.type === "PAGEVIEW" ? visitsByDay : ctaByDay;
    const set = bucket.get(key) ?? new Set<string>();
    set.add(e.sessionId);
    bucket.set(key, set);
  }
  const signupsByDay = new Map<string, number>();
  for (const o of orgs) {
    const key = dayKey(o.createdAt);
    signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
  }

  const start = sinceDaysAgo(days);
  return Array.from({ length: days }, (_, i) => {
    const key = dayKey(new Date(start.getTime() + i * DAY_MS));
    return {
      date: key,
      visits: visitsByDay.get(key)?.size ?? 0,
      ctaClicks: ctaByDay.get(key)?.size ?? 0,
      signups: signupsByDay.get(key) ?? 0,
    };
  });
}

export type Breakdowns = {
  referrers: { label: string; count: number }[];
  devices: { label: string; count: number }[];
  topPaths: { label: string; count: number }[];
};

const byCountDesc = (a: { count: number }, b: { count: number }) => b.count - a.count;

export async function breakdowns(days = 30): Promise<Breakdowns> {
  const since = sinceDaysAgo(days);
  const where = { type: "PAGEVIEW" as const, createdAt: { gte: since } };
  const [referrers, devices, topPaths] = await Promise.all([
    prisma.siteEvent.groupBy({ by: ["referrer"], where, _count: true }),
    prisma.siteEvent.groupBy({ by: ["device"], where, _count: true }),
    prisma.siteEvent.groupBy({ by: ["path"], where, _count: true }),
  ]);
  return {
    referrers: referrers.map((r) => ({ label: r.referrer ?? "Прямой заход", count: Number(r._count) })).sort(byCountDesc).slice(0, 10),
    devices: devices.map((d) => ({ label: d.device ?? "неизвестно", count: Number(d._count) })).sort(byCountDesc),
    topPaths: topPaths.map((p) => ({ label: p.path, count: Number(p._count) })).sort(byCountDesc).slice(0, 10),
  };
}

async function scrollCompletionTrend(): Promise<{ thisWeek: number; lastWeek: number }> {
  const since = sinceDaysAgo(14);
  const events = await prisma.siteEvent.findMany({
    where: { createdAt: { gte: since }, type: { in: ["PAGEVIEW", "SCROLL_100"] } },
    select: { type: true, sessionId: true, createdAt: true },
  });
  const boundary = sinceDaysAgo(7);
  const rate = (evs: RawEvent[]) => {
    const pv = new Set(evs.filter((e) => e.type === "PAGEVIEW").map((e) => e.sessionId));
    const s100 = new Set(evs.filter((e) => e.type === "SCROLL_100").map((e) => e.sessionId));
    return pv.size ? Math.round((s100.size / pv.size) * 1000) / 10 : 0;
  };
  return {
    thisWeek: rate(events.filter((e) => e.createdAt >= boundary)),
    lastWeek: rate(events.filter((e) => e.createdAt < boundary)),
  };
}

// Собирает вход для generatePlatformInsights() (server/insights/platform.ts).
// Организации/продажи — не про анонимных посетителей, но это единственное
// место, которое сшивает site-сигналы с бизнес-данными для одной страницы
// /root/analytics, поэтому данные для честных правил собираются здесь же.
export async function platformInsightData(days = 30): Promise<PlatformInsightInput> {
  const now = Date.now();
  const d30 = new Date(now - 30 * DAY_MS);
  const d60 = new Date(now - 60 * DAY_MS);
  const d90 = new Date(now - 90 * DAY_MS);
  const onboardingCutoff = new Date(now - ONBOARDING_GRACE_DAYS * DAY_MS);

  const [scrollTrend, funnel, recentCohort, olderCohort, stuckOrgs, activeOrgs] = await Promise.all([
    scrollCompletionTrend(),
    funnelStats(days),
    prisma.organization.findMany({ where: { createdAt: { gte: d60, lt: d30 } }, select: { subscriptionStatus: true } }),
    prisma.organization.findMany({ where: { createdAt: { gte: d90, lt: d60 } }, select: { subscriptionStatus: true } }),
    prisma.organization.findMany({
      where: { subscriptionStatus: "TRIAL", createdAt: { lt: onboardingCutoff } },
      select: { id: true, name: true, createdAt: true, stores: { select: { _count: { select: { products: true } } } } },
    }),
    prisma.organization.findMany({
      where: { subscriptionStatus: "ACTIVE" },
      select: {
        id: true,
        name: true,
        stores: { select: { sales: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } },
      },
    }),
  ]);

  // «Конвертировалась» — сейчас платит или недавно платила (ACTIVE/PAST_DUE).
  // Точной истории статусов нет, это разумное приближение, не точная цифра.
  const converted = (rows: { subscriptionStatus: string }[]) =>
    rows.filter((o) => o.subscriptionStatus === "ACTIVE" || o.subscriptionStatus === "PAST_DUE").length;

  const stuckOnboarding = stuckOrgs
    .filter((o) => o.stores.every((s) => s._count.products === 0))
    .map((o) => ({ orgName: o.name, daysSinceSignup: Math.floor((now - o.createdAt.getTime()) / DAY_MS) }));

  // null (продаж не было вообще) тоже считается «без продаж N+ дней».
  const inactivePaying = activeOrgs
    .map((o) => {
      const lastSale = o.stores.flatMap((s) => s.sales).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const daysSinceLastSale = lastSale ? Math.floor((now - lastSale.createdAt.getTime()) / DAY_MS) : null;
      return { orgName: o.name, daysSinceLastSale };
    })
    .filter((o) => o.daysSinceLastSale === null || o.daysSinceLastSale >= INACTIVE_DAYS);

  return {
    windowDays: days,
    scrollCompletionThisWeek: scrollTrend.thisWeek,
    scrollCompletionLastWeek: scrollTrend.lastWeek,
    ctaClicksWindow: funnel.ctaClicks,
    signupsWindow: funnel.signups,
    trialToPaidRecent: { converted: converted(recentCohort), total: recentCohort.length },
    trialToPaidOlder: { converted: converted(olderCohort), total: olderCohort.length },
    stuckOnboarding,
    inactivePaying,
  };
}
