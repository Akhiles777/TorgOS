"use server";
import { revalidatePath } from "next/cache";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { returnSaleItems, ReturnError, type ReturnLine, type ReturnResult } from "@/server/services/returns";
import { broadcastStock } from "@/server/realtime";
import { prisma } from "@/server/db";
import { toNum } from "@/lib/format";

export type ReturnActionResult = { ok: true; result: ReturnResult } | { ok: false; error: string };

// Возврат по чеку. Роли те же, что и у самого раздела «Чеки» — кассир сюда не
// заходит: возврат денег из кассы решает администратор или владелец.
export async function returnSaleAction(saleId: string, lines: ReturnLine[]): Promise<ReturnActionResult> {
  try {
    const { db, storeId, user } = await requireApiStoreScope("ADMIN", "OWNER");
    const result = await returnSaleItems(db, storeId, user.id, String(saleId), lines);

    // Остатки выросли — открытые кассы должны это увидеть без перезагрузки.
    const productIds = await prisma.saleItem.findMany({
      where: { saleId: String(saleId) },
      select: { productId: true },
    });
    const fresh = await prisma.product.findMany({
      where: { id: { in: productIds.map((p) => p.productId) } },
      select: { id: true, stock: true },
    });
    broadcastStock(storeId, fresh.map((p) => ({ productId: p.id, stock: toNum(p.stock) })));

    revalidatePath("/admin/receipts");
    revalidatePath("/admin");
    return { ok: true, result };
  } catch (e) {
    if (e instanceof ReturnError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error("return sale error", e);
    return { ok: false, error: "Не удалось оформить возврат" };
  }
}
