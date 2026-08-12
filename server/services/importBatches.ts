// Импорт номенклатуры пачками — см. app/admin/import/. Переиспользует
// createProduct/updateProduct (валидация штрихкода, генерация внутреннего
// EAN-13 для развесных и т.д.), не дублирует эту логику. importBatchId
// проставляется ТОЛЬКО у новых товаров (см. комментарий у поля в schema.prisma) —
// откат безопасен именно поэтому: удаляет только добавленное этим импортом.
import { Prisma } from "@prisma/client";
import type { TenantDb } from "../tenant";
import type { ParsedProductRow } from "@/lib/importParser";
import { createProduct, ProductError } from "./products";
import { recalcDependents } from "./horeca/costing";

export type DedupMode = "skip" | "updatePrice" | "updateAll";

export class ImportError extends Error {}

export async function checkExistingBarcodes(db: TenantDb, storeId: string, barcodes: string[]): Promise<Set<string>> {
  if (barcodes.length === 0) return new Set();
  const found = await db.product.findMany({ where: { storeId, barcode: { in: barcodes } }, select: { barcode: true } });
  return new Set(found.map((p) => p.barcode).filter((b): b is string => b !== null));
}

export async function startBatch(
  db: TenantDb, storeId: string, userId: string, fileName: string, rowsTotal: number, aiChecked: boolean,
): Promise<string> {
  const batch = await db.importBatch.create({ data: { storeId, userId, fileName: fileName.slice(0, 200), rowsTotal, aiChecked } });
  return batch.id;
}

export type ChunkResult = { imported: number; updated: number; skipped: number };

export async function commitChunk(
  db: TenantDb,
  batchId: string,
  storeId: string,
  rows: ParsedProductRow[],
  dedupMode: DedupMode,
): Promise<ChunkResult> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  // Себестоимость обновлённых (не новых) товаров могла поменяться — собираем
  // id и пересчитываем зависимые блюда/полуфабрикаты одним пакетом в конце,
  // а не по одному в цикле. Для розницы — пустой список, без эффекта.
  const touchedIds: string[] = [];

  for (const parsed of rows) {
    if (parsed.skip) {
      skipped++;
      continue;
    }
    try {
      const existing = parsed.barcode ? await db.product.findFirst({ where: { storeId, barcode: parsed.barcode } }) : null;

      if (existing) {
        if (dedupMode === "skip") {
          skipped++;
          continue;
        }
        if (dedupMode === "updatePrice") {
          await db.product.update({
            where: { id: existing.id },
            data: { price: new Prisma.Decimal(parsed.price.toFixed(2)), costPrice: new Prisma.Decimal(parsed.costPrice.toFixed(2)) },
          });
          touchedIds.push(existing.id);
          updated++;
          continue;
        }
        // updateAll — номенклатурные поля из файла, склад/активность/показ на кассе не трогаем
        // (showInPos у updateProduct обязателен — передаём текущее значение, чтобы не сбросить его).
        await db.product.update({
          where: { id: existing.id },
          data: {
            name: parsed.name, price: new Prisma.Decimal(parsed.price.toFixed(2)), costPrice: new Prisma.Decimal(parsed.costPrice.toFixed(2)),
            unit: parsed.unit, category: parsed.category, expiry: parsed.expiry ? new Date(parsed.expiry) : null,
          },
        });
        touchedIds.push(existing.id);
        updated++;
        continue;
      }

      await createProduct(db, storeId, {
        name: parsed.name, price: parsed.price, costPrice: parsed.costPrice, unit: parsed.unit, category: parsed.category,
        barcode: parsed.barcode, expiry: parsed.expiry, stock: parsed.stock, importBatchId: batchId, allowInvalidBarcode: true,
      });
      imported++;
    } catch (e) {
      if (e instanceof ProductError) {
        skipped++;
        continue;
      }
      throw e;
    }
  }

  await db.importBatch.update({
    where: { id: batchId },
    data: { rowsImported: { increment: imported + updated }, rowsSkipped: { increment: skipped } },
  });
  if (touchedIds.length) await recalcDependents(db, touchedIds);

  return { imported, updated, skipped };
}

export async function rollbackBatch(db: TenantDb, batchId: string): Promise<void> {
  const batch = await db.importBatch.findFirst({ where: { id: batchId } });
  if (!batch) throw new ImportError("Импорт не найден");
  if (batch.rolledBackAt) throw new ImportError("Уже отменён");
  await db.product.deleteMany({ where: { importBatchId: batchId } });
  await db.importBatch.update({ where: { id: batchId }, data: { rolledBackAt: new Date() } });
}
