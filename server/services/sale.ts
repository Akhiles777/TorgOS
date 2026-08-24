// Единая точка создания Sale (чека) — единственный tx.sale.create во всём
// проекте. И розничная касса (commitSale), и оплата заказа общепита
// (horeca/orders.ts::payOrder) проходят через createSaleRecord — это даёт
// ровно одну точку, куда в будущем цепляется драйвер ККТ (фискальный
// регистратор), не две параллельные.
import { Prisma, type PaymentMethod } from "@prisma/client";
import type { TenantDb } from "../tenant";

// Тип tx внутри db.$transaction(async (tx) => ...) — выводим из сигнатуры
// $transaction, чтобы не городить any и не дублировать его вручную.
// Экспортирован — переиспользуется server/services/horeca/orders.ts.
export type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

export type CreateSaleInput = {
  storeId: string;
  cashierId: string;
  employeeId: string | null;
  total: Prisma.Decimal;
  paymentMethod: PaymentMethod;
  cashGiven: Prisma.Decimal | null;
  changeGiven: Prisma.Decimal | null;
  isDebt: boolean;
  debtorName: string | null;
  debtorContact: string | null;
  // SaleItem создаются только для розницы (прямая продажа товара). Общепит
  // НЕ передаёт items — строки чека живут в Order/OrderItem (см. схему),
  // Sale в этом случае остаётся без SaleItem вовсе.
  items?: { productId: string; quantity: Prisma.Decimal; priceAtSale: Prisma.Decimal }[];
};

export async function createSaleRecord(tx: Tx, input: CreateSaleInput): Promise<{ id: string; number: number }> {
  return tx.sale.create({
    data: {
      storeId: input.storeId, cashierId: input.cashierId, employeeId: input.employeeId,
      total: input.total, paymentMethod: input.paymentMethod,
      cashGiven: input.cashGiven, changeGiven: input.changeGiven,
      isDebt: input.isDebt, debtorName: input.debtorName, debtorContact: input.debtorContact,
      ...(input.items ? { items: { create: input.items } } : {}),
    },
    select: { id: true, number: true },
  });
}

// Наличные: «получено» необязательно — пусто/0 значит «под расчёт», без сдачи.
// Если указано — должно хватать; текст ошибки решает вызывающий (у розницы и
// общепита разная формулировка исторически не нужна, но throw — его забота,
// не этой чистой функции).
export function resolveCash(
  total: Prisma.Decimal,
  paymentMethod: PaymentMethod,
  isDebt: boolean,
  cashGiven?: number | null,
): { cashGiven: Prisma.Decimal | null; changeGiven: Prisma.Decimal | null } | { error: string } {
  if (paymentMethod === "CASH" && !isDebt && cashGiven != null && cashGiven > 0) {
    const given = new Prisma.Decimal(cashGiven.toFixed(2));
    if (given.lessThan(total)) return { error: "Получено меньше суммы чека" };
    return { cashGiven: given, changeGiven: given.minus(total) };
  }
  return { cashGiven: null, changeGiven: null };
}
