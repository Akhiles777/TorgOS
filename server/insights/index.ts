// Контракт «Рекомендаций ИИ». Сейчас наполняется правилами на чистой статистике;
// позже сюда же подключится LLM — ВХОД и ВЫХОД не меняются.
//
//   generateInsights(input: InsightInput): Insight[]
//
// Никаких выдуманных «советов» в UI: если правило не сработало — секция пустая.

export type Severity = "info" | "warn" | "danger";

export type Insight = {
  severity: Severity;
  title: string;
  body: string;
  metric: string; // короткое числовое ребро вывода
  productId?: string;
};

// Агрегаты, посчитанные из реальных чеков (см. analytics.ts).
export type ProductStat = {
  id: string;
  name: string;
  unit: "PCS" | "KG";
  price: number;
  costPrice: number;
  stock: number;
  category: string;
  expiry: Date | null;
  soldQtyWindow: number; // продано за окно (напр. 14 дней)
  revenueWindow: number;
  lastSoldAt: Date | null;
};

export type InsightInput = {
  windowDays: number;
  now: Date;
  products: ProductStat[];
};

const MARGIN_FLOOR = 0.15; // маржа ниже 15% — сигнал
const STALE_DAYS = 10; // товар без продаж N дней
const RUNOUT_SOON_DAYS = 4; // закончится в ближайшие N дней
const EXPIRY_SOON_DAYS = 3;

function marginPct(p: ProductStat): number {
  if (p.price <= 0) return 0;
  return (p.price - p.costPrice) / p.price;
}

function daysSince(now: Date, d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

export function generateInsights(input: InsightInput): Insight[] {
  const { products, now, windowDays } = input;
  // group: складские сигналы (stock) дедупятся отдельно от ценовых (pricing),
  // чтобы «низкая наценка» не вытеснялась сигналом «скоро закончится» по тому же товару.
  const out: (Insight & { group: "stock" | "pricing" })[] = [];

  for (const p of products) {
    // 1. Скоро закончится при текущей скорости продаж
    const perDay = p.soldQtyWindow / windowDays;
    if (perDay > 0 && p.stock > 0) {
      const daysLeft = p.stock / perDay;
      if (daysLeft <= RUNOUT_SOON_DAYS) {
        const unit = p.unit === "KG" ? "кг" : "шт";
        out.push({
          group: "stock",
          severity: daysLeft <= 1.5 ? "danger" : "warn",
          title: `Скоро закончится: ${p.name}`,
          body: `Остаток ${p.stock.toFixed(p.unit === "KG" ? 1 : 0)} ${unit}, продаётся ~${perDay.toFixed(1)} ${unit}/день. Хватит примерно на ${Math.max(0, Math.round(daysLeft))} дн. Пора заказывать.`,
          metric: `${Math.max(0, Math.round(daysLeft))} дн до нуля`,
          productId: p.id,
        });
      }
    }

    // 2. Залежался — нет продаж
    const stale = daysSince(now, p.lastSoldAt);
    if ((stale === null || stale >= STALE_DAYS) && p.stock > 0) {
      out.push({
        group: "stock",
        severity: "warn",
        title: `Не продаётся: ${p.name}`,
        body:
          stale === null
            ? `За ${windowDays} дней — ни одной продажи, а на складе ${p.stock.toFixed(p.unit === "KG" ? 1 : 0)} ${p.unit === "KG" ? "кг" : "шт"}. Возможно, стоит убрать с витрины или сделать скидку.`
            : `Последняя продажа ${stale} дн назад. Деньги «заморожены» в остатке.`,
        metric: stale === null ? `0 продаж / ${windowDays} дн` : `${stale} дн без продаж`,
        productId: p.id,
      });
    }

    // 3. Низкая маржа (ценовой сигнал)
    const m = marginPct(p);
    if (p.soldQtyWindow > 0 && m < MARGIN_FLOOR) {
      out.push({
        group: "pricing",
        severity: m <= 0 ? "danger" : "info",
        title: `Низкая наценка: ${p.name}`,
        body: `Наценка всего ${(m * 100).toFixed(0)}% (цена ${p.price} ₽, себестоимость ${p.costPrice} ₽). Товар ходовой — пересмотрите цену или поставщика.`,
        metric: `наценка ${(m * 100).toFixed(0)}%`,
        productId: p.id,
      });
    }

    // 4. Истекает срок годности
    const expDays = daysSince(now, p.expiry);
    if (p.expiry && expDays !== null && -expDays <= EXPIRY_SOON_DAYS && p.stock > 0) {
      const left = -expDays;
      out.push({
        group: "stock",
        severity: left <= 1 ? "danger" : "warn",
        title: `Истекает срок: ${p.name}`,
        body: `Срок годности заканчивается через ${Math.max(0, left)} дн, на остатке ${p.stock.toFixed(p.unit === "KG" ? 1 : 0)} ${p.unit === "KG" ? "кг" : "шт"}. Сделайте скидку, чтобы не списывать.`,
        metric: `${Math.max(0, left)} дн до истечения`,
        productId: p.id,
      });
    }
  }

  const rank: Record<Severity, number> = { danger: 0, warn: 1, info: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // Один складской + один ценовой сигнал на товар: список разнообразный,
  // а не тремя строчками про самсу.
  const seen = new Set<string>();
  const deduped = out.filter((i) => {
    if (!i.productId) return true;
    const key = `${i.group}:${i.productId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.slice(0, 14).map(({ group: _g, ...rest }) => rest);
}
