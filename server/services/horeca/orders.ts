// Заказы общепита: черновик («Отложить»), оплата (payOrder). Sale создаётся
// ТОЛЬКО здесь и в commitSale — оба через createSaleRecord (server/services/sale.ts),
// единственную точку создания чека в проекте (см. отчёт по фиче HORECA).
import { Prisma, type PaymentMethod } from "@prisma/client";
import type { TenantDb } from "../../tenant";
import type { Tx } from "../sale";
import { toNum } from "@/lib/format";
import { createSaleRecord, resolveCash } from "../sale";
import type { DraftLine, SelectedModifierSnapshot } from "./types";

export class OrderError extends Error {}

type PricedItem = {
  menuItemId: string;
  nameAtSale: string;
  quantity: Prisma.Decimal;
  priceAtSale: Prisma.Decimal;
  costAtSale: Prisma.Decimal;
  modifiers: SelectedModifierSnapshot[] | null;
  comment: string | null;
};

// Пересчитывает цену/себестоимость каждой строки на сервере — клиентским
// данным не доверяем (тот же принцип, что в commitSale). Единственное место,
// где цена заказа фиксируется — что для «Отложить», что для оплаты с ходу.
async function priceDraftLines(db: TenantDb | Tx, storeId: string, lines: DraftLine[]): Promise<PricedItem[]> {
  if (!lines.length) throw new OrderError("Заказ пуст");
  const menuItemIds = [...new Set(lines.map((l) => l.menuItemId))];
  const items = await db.menuItem.findMany({
    where: { id: { in: menuItemIds }, storeId, isActive: true },
    select: { id: true, name: true, price: true, cachedCost: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  if (byId.size !== menuItemIds.length) throw new OrderError("Часть блюд недоступна — обновите кассу");

  const allModifierIds = [...new Set(lines.flatMap((l) => l.modifierIds))];
  const modifiers = allModifierIds.length
    ? await db.modifier.findMany({
        where: { id: { in: allModifierIds }, isActive: true, group: { menuItems: { some: { menuItemId: { in: menuItemIds } } } } },
      })
    : [];
  const modById = new Map(modifiers.map((m) => [m.id, m]));

  const result: PricedItem[] = [];
  for (const line of lines) {
    if (line.quantity <= 0) throw new OrderError("Количество должно быть больше нуля");
    const item = byId.get(line.menuItemId)!;
    const selected = line.modifierIds.map((id) => {
      const m = modById.get(id);
      if (!m) throw new OrderError("Модификатор недоступен — обновите кассу");
      return m;
    });
    const priceDelta = selected.reduce((s, m) => s + toNum(m.priceDelta), 0);
    const priceAtSale = new Prisma.Decimal((toNum(item.price) + priceDelta).toFixed(2));
    const costAtSale = new Prisma.Decimal((item.cachedCost != null ? toNum(item.cachedCost) : 0).toFixed(2));
    const modifiersSnapshot: SelectedModifierSnapshot[] = selected.map((m) => ({
      modifierId: m.id, name: m.name, priceDelta: toNum(m.priceDelta),
      addProductId: m.addProductId, addQuantity: m.addQuantity != null ? toNum(m.addQuantity) : null,
      replacesProductId: m.replacesProductId,
    }));
    result.push({
      menuItemId: item.id, nameAtSale: item.name, quantity: new Prisma.Decimal(line.quantity.toFixed(3)),
      priceAtSale, costAtSale, modifiers: modifiersSnapshot.length ? modifiersSnapshot : null,
      comment: line.comment?.trim() || null,
    });
  }
  return result;
}

// ── «Отложить» — открытая комната до оплаты ──────────────────────────────
export async function createOrderDraft(
  db: TenantDb, storeId: string, userId: string, employeeId: string | null, lines: DraftLine[],
): Promise<string> {
  const priced = await priceDraftLines(db, storeId, lines);
  const order = await db.order.create({
    data: {
      storeId, userId, employeeId, status: "OPEN",
      items: { create: priced.map((p) => ({ ...p, modifiers: p.modifiers ?? Prisma.DbNull })) },
    },
    select: { id: true },
  });
  return order.id;
}

export async function updateOrderDraft(db: TenantDb, storeId: string, orderId: string, lines: DraftLine[]): Promise<void> {
  const order = await db.order.findFirst({ where: { id: orderId, status: "OPEN" }, select: { id: true } });
  if (!order) throw new OrderError("Заказ не найден или уже оплачен");
  const priced = await priceDraftLines(db, storeId, lines);
  await db.$transaction([
    db.orderItem.deleteMany({ where: { orderId } }),
    db.orderItem.createMany({
      data: priced.map((p) => ({
        orderId, menuItemId: p.menuItemId, nameAtSale: p.nameAtSale, quantity: p.quantity,
        priceAtSale: p.priceAtSale, costAtSale: p.costAtSale, modifiers: p.modifiers ?? Prisma.DbNull, comment: p.comment,
      })),
    }),
  ]);
}

export async function cancelOrder(db: TenantDb, orderId: string): Promise<void> {
  const order = await db.order.findFirst({ where: { id: orderId, status: "OPEN" }, select: { id: true } });
  if (!order) throw new OrderError("Заказ не найден или уже оплачен");
  await db.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
}

// ── Оплата ────────────────────────────────────────────────────────────
export type PayInput = {
  paymentMethod: PaymentMethod;
  cashGiven?: number | null;
  isDebt?: boolean;
  debtorName?: string | null;
  debtorContact?: string | null;
};

export type PayResult = {
  saleId: string;
  number: number;
  total: number;
  changeGiven: number | null;
  // Ингредиент ушёл в минус — гостя уже не остановить, просто предупреждаем
  // (в отличие от /admin/production, где недостача блокирует проведение).
  warnings: string[];
  stockUpdates: { productId: string; stock: number }[];
};

export async function payOrder(
  db: TenantDb,
  storeId: string,
  userId: string,
  employeeId: string | null,
  source: { orderId: string } | { lines: DraftLine[] },
  payment: PayInput,
): Promise<PayResult> {
  return db.$transaction(async (tx) => {
    let orderId: string;
    let orderNumber: number;
    let items: { menuItemId: string; quantity: Prisma.Decimal; priceAtSale: Prisma.Decimal; modifiers: Prisma.JsonValue | null }[];

    if ("orderId" in source) {
      const order = await tx.order.findFirst({ where: { id: source.orderId, storeId, status: "OPEN" }, include: { items: true } });
      if (!order) throw new OrderError("Заказ не найден или уже оплачен");
      orderId = order.id;
      orderNumber = order.number;
      items = order.items;
    } else {
      const priced = await priceDraftLines(tx, storeId, source.lines);
      const order = await tx.order.create({
        data: {
          storeId, userId, employeeId, status: "OPEN",
          items: { create: priced.map((p) => ({ ...p, modifiers: p.modifiers ?? Prisma.DbNull })) },
        },
        include: { items: true },
      });
      orderId = order.id;
      orderNumber = order.number;
      items = order.items;
    }

    let total = new Prisma.Decimal(0);
    for (const it of items) total = total.plus(it.priceAtSale.times(it.quantity));

    const cash = resolveCash(total, payment.paymentMethod, !!payment.isDebt, payment.cashGiven);
    if ("error" in cash) throw new OrderError(cash.error);

    const sale = await createSaleRecord(tx, {
      storeId, cashierId: userId, employeeId, total, paymentMethod: payment.paymentMethod,
      cashGiven: cash.cashGiven, changeGiven: cash.changeGiven, isDebt: !!payment.isDebt,
      debtorName: payment.isDebt ? (payment.debtorName?.trim() || null) : null,
      debtorContact: payment.isDebt ? (payment.debtorContact?.trim() || null) : null,
    });

    await tx.order.update({ where: { id: orderId }, data: { status: "PAID", saleId: sale.id, paidAt: new Date() } });

    // Разворачиваем рецепт каждой строки (+ эффект модификаторов: replaces
    // пропускает соответствующий базовый ингредиент, add добавляет сверх) в
    // одну агрегированную карту productId → количество к списанию.
    const menuItemIds = [...new Set(items.map((it) => it.menuItemId))];
    const recipeLines = await tx.recipeLine.findMany({ where: { menuItemId: { in: menuItemIds } } });
    const recipeByMenuItem = new Map<string, typeof recipeLines>();
    for (const rl of recipeLines) {
      const arr = recipeByMenuItem.get(rl.menuItemId!) ?? [];
      arr.push(rl);
      recipeByMenuItem.set(rl.menuItemId!, arr);
    }

    const deduction = new Map<string, Prisma.Decimal>();
    const addDeduction = (productId: string, qty: Prisma.Decimal) => {
      deduction.set(productId, (deduction.get(productId) ?? new Prisma.Decimal(0)).plus(qty));
    };

    for (const it of items) {
      const recipe = recipeByMenuItem.get(it.menuItemId) ?? [];
      const modifiers = (it.modifiers as SelectedModifierSnapshot[] | null) ?? [];
      const replacedIngredientIds = new Set(modifiers.filter((m) => m.replacesProductId).map((m) => m.replacesProductId!));
      for (const rl of recipe) {
        if (replacedIngredientIds.has(rl.productId)) continue; // заменён модификатором — базовый не списываем
        addDeduction(rl.productId, rl.quantity.times(it.quantity));
      }
      for (const m of modifiers) {
        if (m.addProductId && m.addQuantity != null) {
          addDeduction(m.addProductId, new Prisma.Decimal(m.addQuantity.toFixed(3)).times(it.quantity));
        }
      }
    }

    const warnings: string[] = [];
    const stockUpdates: { productId: string; stock: number }[] = [];
    const productIds = [...deduction.keys()].filter((id) => !deduction.get(id)!.isZero());
    if (productIds.length) {
      const products = await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, stock: true } });
      const productById = new Map(products.map((p) => [p.id, p]));
      for (const productId of productIds) {
        const qty = deduction.get(productId)!;
        const p = productById.get(productId);
        if (!p) continue; // защитная развилка — не должно случаться, FK гарантирует существование
        if (p.stock.minus(qty).lessThan(0)) {
          warnings.push(`Не хватает: ${p.name} (не хватило ${qty.minus(p.stock).toFixed(3)})`);
        }
        const updated = await tx.product.update({ where: { id: productId }, data: { stock: { decrement: qty } }, select: { stock: true } });
        stockUpdates.push({ productId, stock: toNum(updated.stock) });
      }
      await tx.stockMovement.createMany({
        data: productIds.map((productId) => ({
          productId, type: "OUT" as const, quantity: deduction.get(productId)!, reason: `заказ №${orderNumber}`, userId,
        })),
      });
    }

    return {
      saleId: sale.id, number: sale.number, total: toNum(total),
      changeGiven: cash.changeGiven != null ? toNum(cash.changeGiven) : null,
      warnings, stockUpdates,
    };
  });
}
