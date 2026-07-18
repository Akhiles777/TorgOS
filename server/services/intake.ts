// Применение проверенной приёмки: существующим товарам — приход, новых —
// заводим и приходуем. Возвращаем список затронутых товаров (для проверки).
import type { TenantDb } from "../tenant";
import { createProduct, moveStock } from "./products";
import type { IntakeItem } from "../ai/product-intake";

export type IntakeResultItem = { productId: string; name: string; action: "created" | "restocked"; quantity: number; unit: "PCS" | "KG" };

export async function applyIntake(
  db: TenantDb,
  storeId: string,
  userId: string,
  items: IntakeItem[],
): Promise<IntakeResultItem[]> {
  const results: IntakeResultItem[] = [];
  for (const it of items) {
    if (it.quantity <= 0) continue;
    if (it.matchedProductId) {
      // Существующий товар — просто приход.
      await moveStock(db, it.matchedProductId, userId, "IN", it.quantity, "приёмка (ИИ)");
      results.push({ productId: it.matchedProductId, name: it.name, action: "restocked", quantity: it.quantity, unit: it.unit });
    } else {
      // Новый товар: заводим с нулём и приходуем, чтобы осталась запись движения.
      const created = await createProduct(db, storeId, {
        name: it.name, price: it.price, costPrice: it.costPrice, unit: it.unit, category: it.category, stock: 0,
      });
      await moveStock(db, created.id, userId, "IN", it.quantity, "приёмка (ИИ)");
      results.push({ productId: created.id, name: created.name, action: "created", quantity: it.quantity, unit: it.unit });
    }
  }
  return results;
}
