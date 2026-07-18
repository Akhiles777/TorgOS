"use server";
import { revalidatePath } from "next/cache";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { parseIntake, IntakeError, type IntakeItem } from "@/server/ai/product-intake";
import { applyIntake, type IntakeResultItem } from "@/server/services/intake";
import { broadcastRestock } from "@/server/realtime";

export type ParseResult = { ok: true; items: IntakeItem[] } | { ok: false; error: string };
export type ApplyResult = { ok: true; items: IntakeResultItem[] } | { ok: false; error: string };

// Шаг 1: разобрать текст в список позиций (ничего не сохраняем).
export async function parseIntakeAction(text: string): Promise<ParseResult> {
  try {
    const { db, storeId } = await requireApiStoreScope("OWNER", "ADMIN");
    const items = await parseIntake(db, storeId, text);
    return { ok: true, items };
  } catch (e) {
    if (e instanceof IntakeError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось разобрать приёмку" };
  }
}

// Шаг 2: применить проверенный список и уведомить все экраны точки.
export async function applyIntakeAction(items: IntakeItem[], userName: string): Promise<ApplyResult> {
  try {
    const { user, db, storeId } = await requireApiStoreScope("OWNER", "ADMIN");
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Список пуст" };
    const results = await applyIntake(db, storeId, user.id, items);
    // Рекомендация обновить страницу — на все открытые экраны точки.
    broadcastRestock(storeId, results.length, userName || user.name);
    revalidatePath("/admin");
    return { ok: true, items: results };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось сохранить приёмку" };
  }
}
