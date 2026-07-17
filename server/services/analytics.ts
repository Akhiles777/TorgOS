// Аналитика владельца: всё считается из реальных чеков (никаких фейков в UI).
import type { TenantDb } from "../tenant";
import { toNum } from "@/lib/format";
import { generateInsights, type ProductStat, type Insight } from "../insights";

export type StoreSummary = {
  storeId: string;
  storeName: string;
  revenueToday: number;
  revenueWindow: number;
  salesToday: number;
  avgCheck: number;
  marginWindow: number; // валовая прибыль за окно (выручка − себестоимость проданного)
};

export type ProductRank = { id: string; name: string; unit: "PCS" | "KG"; qty: number; revenue: number; margin: number };

export type OwnerDashboard = {
  windowDays: number;
  totals: { revenueToday: number; revenueWindow: number; salesWindow: number; avgCheck: number; marginWindow: number };
  stores: StoreSummary[];
  top: ProductRank[];
  bottom: ProductRank[];
  dailyRevenue: { date: string; revenue: number }[];
  insights: Insight[];
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function ownerDashboard(db: TenantDb, windowDays = 14): Promise<OwnerDashboard> {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const todayStart = startOfToday();

  const stores = await db.store.findMany({ select: { id: true, name: true } });

  // Чеки за окно с позициями и себестоимостью товара
  const sales = await db.sale.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true, storeId: true, total: true, createdAt: true,
      items: { select: { quantity: true, priceAtSale: true, product: { select: { id: true, name: true, unit: true, costPrice: true } } } },
    },
  });

  // Агрегаты по точкам и по товарам
  const perStore = new Map<string, { revToday: number; revWin: number; salesToday: number; salesWin: number; margin: number }>();
  const perProduct = new Map<string, ProductRank & { cost: number }>();
  const perDay = new Map<string, number>();
  for (const s of stores) perStore.set(s.id, { revToday: 0, revWin: 0, salesToday: 0, salesWin: 0, margin: 0 });

  let revToday = 0, revWin = 0, marginWin = 0;
  for (const sale of sales) {
    const t = toNum(sale.total);
    const st = perStore.get(sale.storeId);
    revWin += t;
    if (st) { st.revWin += t; st.salesWin += 1; }
    const isToday = sale.createdAt >= todayStart;
    if (isToday) { revToday += t; if (st) { st.revToday += t; st.salesToday += 1; } }

    const dayKey = sale.createdAt.toISOString().slice(0, 10);
    perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + t);

    for (const it of sale.items) {
      const q = toNum(it.quantity);
      const rev = toNum(it.priceAtSale) * q;
      const cost = toNum(it.product.costPrice) * q;
      marginWin += rev - cost;
      if (st) st.margin += rev - cost;
      const key = it.product.id;
      const cur = perProduct.get(key) ?? { id: key, name: it.product.name, unit: it.product.unit, qty: 0, revenue: 0, margin: 0, cost: 0 };
      cur.qty += q; cur.revenue += rev; cur.margin += rev - cost; cur.cost += cost;
      perProduct.set(key, cur);
    }
  }

  const salesWin = sales.length;
  const avgCheck = salesWin ? revWin / salesWin : 0;

  const storeSummaries: StoreSummary[] = stores.map((s) => {
    const a = perStore.get(s.id)!;
    return {
      storeId: s.id, storeName: s.name,
      revenueToday: a.revToday, revenueWindow: a.revWin, salesToday: a.salesToday,
      avgCheck: a.salesWin ? a.revWin / a.salesWin : 0, marginWindow: a.margin,
    };
  });

  const ranked = [...perProduct.values()].map(({ cost: _c, ...r }) => r).sort((a, b) => b.revenue - a.revenue);
  const top = ranked.slice(0, 7);
  const bottom = ranked.filter((r) => r.revenue > 0).slice(-5).reverse();

  const dailyRevenue = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(todayStart.getTime() - (windowDays - 1 - i) * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, revenue: Math.round(perDay.get(key) ?? 0) };
  });

  // Инсайты: собираем ProductStat из товаров + окна продаж
  const products = await db.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, unit: true, price: true, costPrice: true, stock: true, category: true, expiry: true },
  });
  const lastSold = new Map<string, Date>();
  for (const sale of sales) for (const it of sale.items) {
    const prev = lastSold.get(it.product.id);
    if (!prev || sale.createdAt > prev) lastSold.set(it.product.id, sale.createdAt);
  }
  const statInput: ProductStat[] = products.map((p) => {
    const agg = perProduct.get(p.id);
    return {
      id: p.id, name: p.name, unit: p.unit, price: toNum(p.price), costPrice: toNum(p.costPrice),
      stock: toNum(p.stock), category: p.category, expiry: p.expiry,
      soldQtyWindow: agg?.qty ?? 0, revenueWindow: agg?.revenue ?? 0, lastSoldAt: lastSold.get(p.id) ?? null,
    };
  });
  const insights = generateInsights({ windowDays, now, products: statInput });

  return {
    windowDays,
    totals: { revenueToday: revToday, revenueWindow: revWin, salesWindow: salesWin, avgCheck, marginWindow: marginWin },
    stores: storeSummaries,
    top, bottom, dailyRevenue, insights,
  };
}
