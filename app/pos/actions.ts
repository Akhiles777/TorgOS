"use server";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { startShift, ShiftError } from "@/server/services/shift";
import { createProduct, moveStock } from "@/server/services/products";
import { describeSaveError } from "@/server/services/quickAdd";
import { lookupBarcode } from "@/server/ai/barcodeLookup";
import { reserveAiLookups, AiBudgetError } from "@/server/ai/aiBudget";
import { isValidBarcode } from "@/lib/ean13";
import { toNum } from "@/lib/format";
import type { PosProduct } from "@/server/services/pos";
import type { Unit } from "@prisma/client";

export type ShiftResult = { ok: true; employee: { id: string; name: string } } | { ok: false; error: string };

// Отметить, кто заступил на смену (один тап на кассе).
export async function startShiftAction(employeeId: string): Promise<ShiftResult> {
  try {
    const { db, storeId } = await requireApiStoreScope("OWNER", "ADMIN", "CASHIER");
    const employee = await startShift(db, storeId, employeeId);
    return { ok: true, employee };
  } catch (e) {
    if (e instanceof ShiftError) return { ok: false, error: e.message };
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("startShift error", e);
    return { ok: false, error: "Не удалось начать смену" };
  }
}

// Пробили штрихкод, а товара в базе нет — кассир не должен звать админа и
// терять покупателя в очереди. Эти два действия дают завести товар прямо с
// кассы: сначала спросить у ИИ, что это за штрихкод, потом создать товар и
// сразу пробить его в чек.
export type PosLookupResult =
  | {
      ok: true; name: string; category: string; sure: boolean;
      unit?: "PCS" | "KG" | null;
      // Другие написания из справочников — кассир выбирает нужное тапом.
      alternatives?: string[];
      // Названия из двух справочников совпали по смыслу.
      verified?: boolean;
      // Штрихкод найден в двух независимых справочниках.
      inTwoSources?: boolean;
      // Название пришло только из ИИ-поиска — его обязательно надо сверить.
      fromWeb?: boolean;
    }
  | { ok: false; error: string };

export async function posLookupBarcodeAction(barcode: string): Promise<PosLookupResult> {
  try {
    const { db, storeId } = await requireApiStoreScope("OWNER", "ADMIN", "CASHIER");
    const clean = barcode.trim();
    if (!isValidBarcode(clean)) return { ok: false, error: "Некорректный штрихкод" };
    // Если товар уже заведён (кассир набрал код руками) — платный запрос к ИИ
    // не нужен, отвечаем из своей же базы.
    const own = await db.product.findFirst({ where: { storeId, barcode: clean }, select: { name: true, category: true } });
    if (own) return { ok: true, name: own.name, category: own.category, sure: true };

    // 2 — на случай углублённого второго захода по ненайденному.
    reserveAiLookups(storeId, 2);
    const cats = await db.product.findMany({ where: { storeId }, select: { category: true }, distinct: ["category"] });
    // tidy: false — на кассе ждать модель нельзя, справочник отвечает за
    // доли секунды, а название приводится локальными правилами.
    const res = await lookupBarcode(clean, cats.map((c) => c.category).filter(Boolean), { tidy: false });
    if (!res.found) return { ok: false, error: res.error };
    return {
      ok: true, name: res.name, category: res.category, sure: res.confidence === "high",
      unit: res.unit, alternatives: res.alternatives ?? [], verified: res.verified ?? false,
      inTwoSources: res.inTwoSources ?? false, fromWeb: res.source === "web",
    };
  } catch (e) {
    if (e instanceof AiBudgetError) return { ok: false, error: e.message };
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error("posLookupBarcode error", e);
    return { ok: false, error: "Не удалось найти товар" };
  }
}

export type PosCreateResult = { ok: true; product: PosProduct } | { ok: false; error: string };

export async function posCreateProductAction(input: {
  barcode: string; name: string; category: string; price: number; costPrice: number; unit: Unit; stock: number;
}): Promise<PosCreateResult> {
  try {
    const { db, storeId, user } = await requireApiStoreScope("OWNER", "ADMIN", "CASHIER");
    const created = await createProduct(db, storeId, {
      name: String(input.name ?? "").trim(),
      price: Number(input.price) || 0,
      costPrice: Number(input.costPrice) || 0,
      unit: (input.unit === "KG" ? "KG" : "PCS") as Unit,
      category: String(input.category ?? "").trim() || "Прочее",
      barcode: String(input.barcode ?? "").trim() || null,
      stock: 0,
    });
    const stock = Math.max(0, Number(input.stock) || 0);
    // Остаток проводим приходом, чтобы появление товара было видно в истории
    // склада — как обычная поставка, а не «возникло из ниоткуда».
    if (stock > 0) await moveStock(db, created.id, user.id, "IN", stock, "заведено на кассе");
    return {
      ok: true,
      product: {
        id: created.id, barcode: created.barcode, name: created.name, price: created.price,
        unit: created.unit, category: created.category, stock: toNum(stock), showInPos: created.showInPos,
      },
    };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    // Включая гонку двух касс по одному штрихкоду — см. describeSaveError.
    const known = describeSaveError(e);
    if (known) return { ok: false, error: known };
    console.error("posCreateProduct error", e);
    return { ok: false, error: "Не удалось создать товар" };
  }
}
