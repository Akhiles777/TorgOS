"use server";
import { revalidatePath } from "next/cache";
import { AuthError } from "@/server/guard";
import { requireHorecaApiStoreScope } from "@/server/org";
import { previewProduction, produce, ProductionError, type ProductionPreview } from "@/server/services/horeca/production";

type PreviewResult = { ok: true; preview: ProductionPreview } | { ok: false; error: string };
type ProduceResult = { ok: true } | { ok: false; error: string };

export async function previewProductionAction(productId: string, quantity: number): Promise<PreviewResult> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    const preview = await previewProduction(db, productId, quantity);
    return { ok: true, preview };
  } catch (e) {
    if (e instanceof ProductionError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось посчитать расход" };
  }
}

export async function runProductionAction(productId: string, quantity: number, comment: string): Promise<ProduceResult> {
  try {
    const { user, db, storeId } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await produce(db, storeId, user.id, productId, quantity, comment);
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (e) {
    if (e instanceof ProductionError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось провести производство" };
  }
}
