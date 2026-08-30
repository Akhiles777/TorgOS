// Возврат товара по чеку — целиком или выборочно.
//
// Принцип: чек не переписывается и не удаляется. Проданное остаётся проданным,
// а возврат — отдельное событие поверх продажи. Иначе история продаж и выручка
// за прошлые дни начали бы «плыть» задним числом, а по ним считают смены и
// зарплату.
//
// Что происходит при возврате:
//  1. В строке чека растёт returnedQty (возврат бывает частичным).
//  2. Товар возвращается на остаток + пишется движение IN с причиной
//     «возврат по чеку №N» — чтобы в истории склада было видно, откуда приход.
//  3. В чеке растёт returnedTotal — сумма возвращённых денег.
import { Prisma } from "@prisma/client";
import type { TenantDb } from "../tenant";
import { toNum } from "@/lib/format";

export class ReturnError extends Error {}

export type ReturnLine = { saleItemId: string; quantity: number };

export type ReturnResult = {
  saleNumber: number;
  refunded: number;
  lines: { name: string; quantity: number }[];
};

export async function returnSaleItems(
  db: TenantDb,
  storeId: string,
  userId: string,
  saleId: string,
  requested: ReturnLine[],
): Promise<ReturnResult> {
  if (!requested.length) throw new ReturnError("Не выбрано ни одной позиции");

  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, storeId },
      select: {
        id: true, number: true, returnedTotal: true,
        items: {
          select: {
            id: true, productId: true, quantity: true, returnedQty: true, priceAtSale: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!sale) throw new ReturnError("Чек не найден");
    // Чек общепита: строки лежат в заказе, а не в SaleItem — возврат по такому
    // чеку здесь не поддержан, и молча возвращать «ничего» нельзя.
    if (sale.items.length === 0) throw new ReturnError("По этому чеку нет позиций для возврата");

    const byId = new Map(sale.items.map((i) => [i.id, i]));
    let refunded = new Prisma.Decimal(0);
    const done: { name: string; quantity: number }[] = [];

    // Схлопываем дубли: один и тот же saleItemId мог прийти дважды.
    const merged = new Map<string, number>();
    for (const r of requested) {
      const q = Number(r.quantity);
      if (!Number.isFinite(q) || q <= 0) continue;
      merged.set(r.saleItemId, (merged.get(r.saleItemId) ?? 0) + q);
    }
    if (merged.size === 0) throw new ReturnError("Количество для возврата должно быть больше нуля");

    for (const [saleItemId, qty] of merged) {
      const item = byId.get(saleItemId);
      if (!item) throw new ReturnError("Позиция не из этого чека");

      const already = toNum(item.returnedQty);
      const sold = toNum(item.quantity);
      const available = Math.round((sold - already) * 1000) / 1000;
      if (available <= 0) throw new ReturnError(`«${item.product.name}» уже возвращён полностью`);
      if (qty > available + 1e-9) {
        throw new ReturnError(`«${item.product.name}»: к возврату доступно ${available}, запрошено ${qty}`);
      }

      const q = new Prisma.Decimal(qty.toFixed(3));
      await tx.saleItem.update({
        where: { id: item.id },
        data: { returnedQty: { increment: q } },
      });
      // Товар физически вернулся на полку.
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: q } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId, type: "IN", quantity: q,
          reason: `возврат по чеку №${sale.number}`, userId,
        },
      });

      refunded = refunded.plus(item.priceAtSale.times(q));
      done.push({ name: item.product.name, quantity: qty });
    }

    await tx.sale.update({
      where: { id: sale.id },
      data: { returnedTotal: { increment: refunded }, returnedAt: new Date() },
    });

    return { saleNumber: sale.number, refunded: toNum(refunded), lines: done };
  });
}
