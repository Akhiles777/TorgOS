"use server";
import { revalidatePath } from "next/cache";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import {
  checkExistingBarcodes, startBatch, commitChunk, rollbackBatch,
  ImportError, type DedupMode, type ChunkResult,
} from "@/server/services/importBatches";
import { checkImportBatch, type Finding } from "@/server/ai/importCheck";
import type { ParsedProductRow } from "@/lib/importParser";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

// На TRIAL-тарифе ИИ-проверка ограничена первыми 200 строками — проверяем тут,
// а не только в интерфейсе: клиент можно подделать, стоимость вызова — нет.
const TRIAL_AI_CHECK_LIMIT = 200;

export async function checkExistingBarcodesAction(barcodes: string[]): Promise<Result<{ barcodes: string[] }>> {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const found = await checkExistingBarcodes(db, storeId, barcodes);
    return { ok: true, barcodes: [...found] };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось проверить дубли" };
  }
}

export async function checkImportBatchAction(
  rows: { index: number; row: ParsedProductRow }[],
  existingCategories: string[],
): Promise<Result<{ findings: Finding[]; failed: boolean }>> {
  try {
    const { db, user } = await requireApiStoreScope("ADMIN", "OWNER");
    const org = await db.organization.findUnique({ where: { id: user.organizationId }, select: { plan: true } });
    const capped = org?.plan === "TRIAL" ? rows.filter((r) => r.index < TRIAL_AI_CHECK_LIMIT) : rows;
    if (capped.length === 0) return { ok: true, findings: [], failed: false };
    const result = await checkImportBatch(capped, existingCategories);
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Проверка ИИ не удалась" };
  }
}

export async function startImportBatchAction(fileName: string, rowsTotal: number, aiChecked: boolean): Promise<Result<{ batchId: string }>> {
  try {
    const { db, user, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const batchId = await startBatch(db, storeId, user.id, fileName, rowsTotal, aiChecked);
    return { ok: true, batchId };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось начать импорт" };
  }
}

export async function commitImportChunkAction(batchId: string, rows: ParsedProductRow[], dedupMode: DedupMode): Promise<Result<ChunkResult>> {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const result = await commitChunk(db, batchId, storeId, rows, dedupMode);
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось записать пачку товаров" };
  }
}

export async function rollbackImportAction(batchId: string): Promise<Result<object>> {
  try {
    const { db } = await requireApiStoreScope("ADMIN", "OWNER");
    await rollbackBatch(db, batchId);
    revalidatePath("/admin");
    revalidatePath("/admin/import");
    return { ok: true };
  } catch (e) {
    if (e instanceof ImportError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось отменить импорт" };
  }
}
