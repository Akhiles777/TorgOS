// Долги — чеки, пробитые «в долг». Пока debtPaidAt пустой — долг открыт.
import type { TenantDb } from "../tenant";
import { toNum } from "@/lib/format";

export type DebtRow = {
  id: string;
  number: number;
  total: number;
  debtorName: string | null;
  debtorContact: string | null;
  createdAt: string;
  paidAt: string | null;
  items: { name: string; quantity: number; unit: "PCS" | "KG"; priceAtSale: number }[];
};

export async function listDebts(db: TenantDb, storeId: string, includePaid = false) {
  const sales = await db.sale.findMany({
    where: { storeId, isDebt: true, ...(includePaid ? {} : { debtPaidAt: null }) },
    orderBy: [{ debtPaidAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true, number: true, total: true, debtorName: true, debtorContact: true, createdAt: true, debtPaidAt: true,
      items: { select: { quantity: true, priceAtSale: true, product: { select: { name: true, unit: true } } } },
    },
  });
  const rows: DebtRow[] = sales.map((s) => ({
    id: s.id, number: s.number, total: toNum(s.total),
    debtorName: s.debtorName, debtorContact: s.debtorContact,
    createdAt: s.createdAt.toISOString(), paidAt: s.debtPaidAt ? s.debtPaidAt.toISOString() : null,
    items: s.items.map((i) => ({ name: i.product.name, quantity: toNum(i.quantity), unit: i.product.unit, priceAtSale: toNum(i.priceAtSale) })),
  }));
  const openTotal = rows.filter((r) => !r.paidAt).reduce((s, r) => s + r.total, 0);
  const openCount = rows.filter((r) => !r.paidAt).length;
  return { rows, openTotal, openCount };
}

export class DebtError extends Error {}

// Отметить долг погашенным (деньги получены).
export async function markDebtPaid(db: TenantDb, saleId: string): Promise<void> {
  const sale = await db.sale.findFirst({ where: { id: saleId, isDebt: true }, select: { id: true } });
  if (!sale) throw new DebtError("Долг не найден");
  await db.sale.update({ where: { id: saleId }, data: { debtPaidAt: new Date() } });
}
