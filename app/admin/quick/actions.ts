"use server";
import { revalidatePath } from "next/cache";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { lookupBarcodes, type BarcodeLookupResult } from "@/server/ai/barcodeLookup";
import { reserveAiLookups, AiBudgetError } from "@/server/ai/aiBudget";
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
    // Дедуп + отсев мусора до обращения к ИИ: каждый запрос платный.
    const clean = [...new Set(barcodes.map((b) => b.trim()).filter((b) => isValidBarcode(b)))];
    if (clean.length === 0) return { ok: false, error: "Нет позиций с корректным штрихкодом" };
    // Разумный потолок на один заход — чтобы не подвесить запрос на полчаса.
    if (clean.length > 40) return { ok: false, error: "За раз можно распознать не больше 40 позиций" };

    // Штрихкоды, которые уже есть в каталоге точки, ИИ спрашивать незачем:
    // название известно, а сохранить такую строку всё равно не выйдет —
    // createProduct отклонит дубль. Экономит и деньги, и время ожидания.
    const known = await db.product.findMany({
      where: { storeId, barcode: { in: clean } },
      select: { barcode: true, name: true, category: true },
    });
    const knownByCode = new Map(known.map((k) => [k.barcode!, k]));
    const unknown = clean.filter((c) => !knownByCode.has(c));

    reserveAiLookups(storeId, unknown.length);
    const fresh = unknown.length ? await lookupBarcodes(unknown, await storeCategories(db, storeId)) : [];

    const results: BarcodeLookupResult[] = [
      ...known.map((k) => ({ barcode: k.barcode!, found: true as const, name: k.name, category: k.category, known: true as const })),
      ...fresh,
    ];
    return { ok: true, results };
  } catch (e) {
    if (e instanceof AiBudgetError) return { ok: false, error: e.message };
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
