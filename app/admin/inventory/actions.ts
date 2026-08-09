"use server";
import { revalidatePath } from "next/cache";
import { requireApiStoreScope, requireApi, AuthError } from "@/server/guard";
import {
  startSession, scanItem, addManualLine, setLineCount, removeLine, cancelSession, finishSession,
  InventoryError, type InventoryLineRow, type ApplyResult,
} from "@/server/services/inventory";

type ScanOutcome = { line: InventoryLineRow; productName: string } | { notFound: true };
type PlainResult = { ok: true } | { ok: false; error: string };
type StartResult = { ok: true; sessionId: string } | { ok: false; error: string };
type ScanResult = { ok: true; outcome: ScanOutcome } | { ok: false; error: string };
type FinishResult = { ok: true; applied: number; unchanged: number } | { ok: false; error: string };

export async function startSessionAction(): Promise<StartResult> {
  try {
    const { user, db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const sessionId = await startSession(db, storeId, user.id);
    revalidatePath("/admin/inventory");
    return { ok: true, sessionId };
  } catch (e) {
    if (e instanceof InventoryError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось начать инвентаризацию" };
  }
}

export async function scanItemAction(sessionId: string, barcode: string, weightKg?: number): Promise<ScanResult> {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const outcome = await scanItem(db, storeId, sessionId, barcode, weightKg);
    revalidatePath("/admin/inventory");
    return { ok: true, outcome };
  } catch (e) {
    if (e instanceof InventoryError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось учесть скан" };
  }
}

export async function addManualLineAction(sessionId: string, productId: string, weightKg?: number): Promise<ScanResult> {
  try {
    const { db } = await requireApi("ADMIN", "OWNER");
    const outcome = await addManualLine(db, sessionId, productId, weightKg);
    revalidatePath("/admin/inventory");
    return { ok: true, outcome };
  } catch (e) {
    if (e instanceof InventoryError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось добавить позицию" };
  }
}

export async function setLineCountAction(lineId: string, countedQty: number): Promise<PlainResult> {
  try {
    const { db } = await requireApi("ADMIN", "OWNER");
    await setLineCount(db, lineId, countedQty);
    revalidatePath("/admin/inventory");
    return { ok: true };
  } catch (e) {
    if (e instanceof InventoryError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось изменить количество" };
  }
}

export async function removeLineAction(lineId: string): Promise<PlainResult> {
  try {
    const { db } = await requireApi("ADMIN", "OWNER");
    await removeLine(db, lineId);
    revalidatePath("/admin/inventory");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось убрать строку" };
  }
}

export async function cancelSessionAction(sessionId: string): Promise<PlainResult> {
  try {
    const { db } = await requireApi("ADMIN", "OWNER");
    await cancelSession(db, sessionId);
    revalidatePath("/admin/inventory");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось отменить инвентаризацию" };
  }
}

export async function finishSessionAction(sessionId: string): Promise<FinishResult> {
  try {
    const { user, db } = await requireApi("ADMIN", "OWNER");
    const result: ApplyResult = await finishSession(db, sessionId, user.id);
    revalidatePath("/admin/inventory");
    revalidatePath("/admin");
    return { ok: true, applied: result.applied, unchanged: result.unchanged };
  } catch (e) {
    if (e instanceof InventoryError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось завершить инвентаризацию" };
  }
}
