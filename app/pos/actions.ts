"use server";
import { requireApiStoreScope, AuthError } from "@/server/guard";
import { startShift, ShiftError } from "@/server/services/shift";

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
