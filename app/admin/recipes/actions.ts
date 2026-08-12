"use server";
import { revalidatePath } from "next/cache";
import { AuthError } from "@/server/guard";
import { requireHorecaApiStoreScope } from "@/server/org";
import {
  addOrUpdateRecipeLine, removeRecipeLine, setRecipeLineQuantity, setSemiFinished, RecipeError,
} from "@/server/services/horeca/costing";
import { parseRuNumber } from "@/lib/format";

type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown, fallback: string): Result {
  if (e instanceof RecipeError || e instanceof AuthError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: fallback };
}

function readOwner(fd: FormData): { menuItemId: string } | { ownerProductId: string } {
  const menuItemId = String(fd.get("menuItemId") ?? "");
  if (menuItemId) return { menuItemId };
  return { ownerProductId: String(fd.get("ownerProductId") ?? "") };
}

export async function addRecipeLineAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    const productId = String(fd.get("productId") ?? "");
    if (!productId) return { ok: false, error: "Выберите ингредиент" };
    const quantity = parseRuNumber(fd.get("quantity"));
    await addOrUpdateRecipeLine(db, readOwner(fd), productId, quantity);
    revalidatePath("/admin/recipes");
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось добавить ингредиент"); }
}

export async function setRecipeLineQuantityAction(id: string, quantity: number): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await setRecipeLineQuantity(db, id, quantity);
    revalidatePath("/admin/recipes");
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось изменить количество"); }
}

export async function removeRecipeLineAction(id: string): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await removeRecipeLine(db, id);
    revalidatePath("/admin/recipes");
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось удалить ингредиент"); }
}

export async function setSemiFinishedAction(productId: string, flag: boolean): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await setSemiFinished(db, productId, flag);
    revalidatePath("/admin/recipes");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось изменить статус полуфабриката"); }
}
