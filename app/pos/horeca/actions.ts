"use server";
import { AuthError } from "@/server/guard";
import { requireHorecaApiStoreScope } from "@/server/org";
import { createOrderDraft, updateOrderDraft, cancelOrder, OrderError } from "@/server/services/horeca/orders";
import { getOpenOrder, listOpenOrders, type OpenOrderDetail, type OpenOrderRow } from "@/server/services/horeca/pos";
import { getCurrentShift } from "@/server/services/shift";
import type { DraftLine } from "@/server/services/horeca/types";

type Result = { ok: true; orderId: string } | { ok: false; error: string };

// «Отложить»: сохранить текущий чек как открытый заказ (новый или обновить существующий).
export async function saveOpenOrderAction(orderId: string | null, lines: DraftLine[]): Promise<Result> {
  try {
    const { user, db, storeId } = await requireHorecaApiStoreScope("OWNER", "ADMIN", "CASHIER");
    if (orderId) {
      await updateOrderDraft(db, storeId, orderId, lines);
      return { ok: true, orderId };
    }
    const shift = await getCurrentShift(db, storeId);
    const id = await createOrderDraft(db, storeId, user.id, shift?.employee.id ?? null, lines);
    return { ok: true, orderId: id };
  } catch (e) {
    if (e instanceof OrderError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось отложить заказ" };
  }
}

export async function cancelOpenOrderAction(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { db } = await requireHorecaApiStoreScope("OWNER", "ADMIN", "CASHIER");
    await cancelOrder(db, orderId);
    return { ok: true };
  } catch (e) {
    if (e instanceof OrderError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось отменить заказ" };
  }
}

export async function loadOpenOrdersAction(): Promise<OpenOrderRow[]> {
  const { db, storeId } = await requireHorecaApiStoreScope("OWNER", "ADMIN", "CASHIER");
  return listOpenOrders(db, storeId);
}

export async function loadOpenOrderAction(orderId: string): Promise<OpenOrderDetail | null> {
  const { db } = await requireHorecaApiStoreScope("OWNER", "ADMIN", "CASHIER");
  return getOpenOrder(db, orderId);
}
