"use server";
import { revalidatePath } from "next/cache";
import { requireApi, AuthError } from "@/server/guard";
import { markDebtPaid, DebtError } from "@/server/services/debts";

type Result = { ok: true } | { ok: false; error: string };

export async function markDebtPaidAction(saleId: string): Promise<Result> {
  try {
    const { db } = await requireApi("OWNER", "ADMIN");
    await markDebtPaid(db, saleId);
    revalidatePath("/admin/debts");
    return { ok: true };
  } catch (e) {
    if (e instanceof DebtError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось отметить оплату" };
  }
}
