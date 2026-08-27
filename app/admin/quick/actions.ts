"use server";
import { revalidatePath } from "next/cache";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { lookupBarcodes, type BarcodeLookupResult } from "@/server/ai/barcodeLookup";
import { saveQuickRows, type QuickRow, type QuickSaveResult } from "@/server/services/quickAdd";
import { isValidBarcode } from "@/lib/ean13";
import type { Unit } from "@prisma/client";

export type LookupResult = { ok: true; results: BarcodeLookupResult[] } | { ok: false; error: string };
export type SaveResult = { ok: true; result: QuickSaveResult } | { ok: false; error: string };

// Категории точки — подсказка модели, чтобы она не плодила «Напитки» /
// «Напитки и вода» / «Вода» на соседних позициях.
async function storeCategories(db: Awaited<ReturnType<typeof requireApiStoreScope>>["db"], storeId: string) {
  const rows = await db.product.findMany({ where: { storeId }, select: { category: true }, distinct: ["category"] });
  return rows.map((r) => r.category).filter(Boolean);
}

export async function lookupBarcodesAction(barcodes: string[]): Promise<LookupResult> {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const clean = barcodes.map((b) => b.trim()).filter((b) => isValidBarcode(b));
    if (clean.length === 0) return { ok: false, error: "Нет позиций с корректным штрихкодом" };
    // Разумный потолок на один заход — чтобы не подвесить запрос на полчаса.
    if (clean.length > 40) return { ok: false, error: "За раз можно распознать не больше 40 позиций" };
    const results = await lookupBarcodes(clean, await storeCategories(db, storeId));
    return { ok: true, results };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось распознать товары" };
  }
}

export async function saveQuickRowsAction(rows: QuickRow[]): Promise<SaveResult> {
  try {
    const { db, storeId, user } = await requireApiStoreScope("ADMIN", "OWNER");
    if (!rows.length) return { ok: false, error: "Список пуст" };
    const safe: QuickRow[] = rows.map((r) => ({
      barcode: String(r.barcode ?? "").trim(),
      name: String(r.name ?? "").trim(),
      category: String(r.category ?? "").trim(),
      price: Number(r.price) || 0,
      costPrice: Number(r.costPrice) || 0,
      unit: (r.unit === "KG" ? "KG" : "PCS") as Unit,
      stock: Math.max(0, Number(r.stock) || 0),
    }));
    const result = await saveQuickRows(db, storeId, user.id, safe);
    revalidatePath("/admin");
    revalidatePath("/admin/quick");
    return { ok: true, result };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось сохранить товары" };
  }
}
