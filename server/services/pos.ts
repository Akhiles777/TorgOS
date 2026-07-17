// Сервис кассы. Всё через tenantDb — изоляция по организации гарантирована слоем.
import { Prisma, type PaymentMethod } from "@prisma/client";
import type { TenantDb } from "../tenant";
import { prisma } from "../db";
import { toNum } from "@/lib/format";

export type CartLinePayload = { productId: string; quantity: number };
export type CommitPayload = {
  lines: CartLinePayload[];
  paymentMethod: PaymentMethod;
  cashGiven?: number | null;
};

export type PosProduct = {
  id: string;
  barcode: string | null;
  name: string;
  price: number;
  unit: "PCS" | "KG";
  category: string;
  stock: number;
};

function shape(p: {
  id: string; barcode: string | null; name: string; price: Prisma.Decimal; unit: "PCS" | "KG"; category: string; stock: Prisma.Decimal;
}): PosProduct {
  return { id: p.id, barcode: p.barcode, name: p.name, price: toNum(p.price), unit: p.unit, category: p.category, stock: toNum(p.stock) };
}

const SELECT = { id: true, barcode: true, name: true, price: true, unit: true, category: true, stock: true } as const;

// Все активные товары точки — для плиток и клиентского поиска.
export async function loadPosProducts(db: TenantDb, storeId: string): Promise<PosProduct[]> {
  const rows = await db.product.findMany({
    where: { storeId, isActive: true },
    select: SELECT,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map(shape);
}

// Поиск по штрихкоду (ввод сканера). Возвращает товар или null.
export async function findByBarcode(db: TenantDb, storeId: string, barcode: string): Promise<PosProduct | null> {
  const row = await db.product.findFirst({ where: { storeId, barcode: barcode.trim(), isActive: true }, select: SELECT });
  return row ? shape(row) : null;
}

export type CommitResult = {
  saleId: string;
  number: number;
  total: number;
  changeGiven: number | null;
  // Новые остатки затронутых товаров — для WebSocket-рассылки
  stockUpdates: { productId: string; stock: number }[];
};

// Продажа = одна транзакция: Sale + SaleItem[] + списание stock + StockMovement[].
// Цена фиксируется на момент чека (priceAtSale). Считаем деньги на сервере,
// клиенту не доверяем суммы.
export async function commitSale(
  db: TenantDb,
  storeId: string,
  cashierId: string,
  payload: CommitPayload,
): Promise<CommitResult> {
  if (!payload.lines.length) throw new PosError("Чек пуст");

  // Схлопываем дубли строк по товару
  const merged = new Map<string, number>();
  for (const l of payload.lines) {
    if (l.quantity <= 0) throw new PosError("Количество должно быть больше нуля");
    merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
  }
  const ids = [...merged.keys()];

  return db.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { id: { in: ids }, storeId, isActive: true }, select: SELECT });
    if (products.length !== ids.length) throw new PosError("Часть товаров недоступна — обновите кассу");

    let total = new Prisma.Decimal(0);
    const items: { productId: string; quantity: Prisma.Decimal; priceAtSale: Prisma.Decimal }[] = [];
    const stockUpdates: { productId: string; stock: number }[] = [];

    for (const p of products) {
      const q = new Prisma.Decimal(merged.get(p.id)!.toFixed(3));
      if (p.stock.lessThan(q)) throw new PosError(`Недостаточно остатка: ${p.name}`);
      const price = p.price;
      total = total.plus(price.times(q));
      items.push({ productId: p.id, quantity: q, priceAtSale: price });
    }

    const paymentMethod = payload.paymentMethod;
    let cashGiven: Prisma.Decimal | null = null;
    let changeGiven: Prisma.Decimal | null = null;
    if (paymentMethod === "CASH") {
      const given = new Prisma.Decimal((payload.cashGiven ?? 0).toFixed(2));
      if (given.lessThan(total)) throw new PosError("Получено меньше суммы чека");
      cashGiven = given;
      changeGiven = given.minus(total);
    }

    const sale = await tx.sale.create({
      data: {
        storeId, cashierId, total, paymentMethod, cashGiven, changeGiven,
        items: { create: items },
      },
      select: { id: true, number: true },
    });

    // Списание остатков + движения
    for (const it of items) {
      const updated = await tx.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: it.quantity } },
        select: { stock: true },
      });
      stockUpdates.push({ productId: it.productId, stock: toNum(updated.stock) });
    }
    await tx.stockMovement.createMany({
      data: items.map((it) => ({ productId: it.productId, type: "OUT" as const, quantity: it.quantity, reason: "продажа", userId: cashierId })),
    });

    return {
      saleId: sale.id,
      number: sale.number,
      total: toNum(total),
      changeGiven: changeGiven != null ? toNum(changeGiven) : null,
      stockUpdates,
    };
  });
}

export class PosError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosError";
  }
}

// Текущие остатки точки — для стартовой синхронизации WebSocket-клиента.
export async function currentStocks(storeId: string): Promise<Record<string, number>> {
  const rows = await prisma.product.findMany({ where: { storeId }, select: { id: true, stock: true } });
  return Object.fromEntries(rows.map((r) => [r.id, toNum(r.stock)]));
}
