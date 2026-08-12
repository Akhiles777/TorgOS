"use server";
import { revalidatePath } from "next/cache";
import { AuthError } from "@/server/guard";
import { requireHorecaApiStoreScope } from "@/server/org";
import {
  createCategory, renameCategory, deleteCategory, moveCategory,
  createMenuItem, updateMenuItem, toggleMenuItemActive, deleteMenuItem, moveMenuItem,
  createModifierGroup, updateModifierGroup, deleteModifierGroup,
  createModifier, updateModifier, deleteModifier,
  MenuError, type MenuItemInput, type ModifierGroupInput, type ModifierInput,
} from "@/server/services/horeca/menu";
import { parseRuNumber } from "@/lib/format";

type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown, fallback: string): Result {
  if (e instanceof MenuError || e instanceof AuthError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: fallback };
}

// ── Категории ──
export async function saveCategoryAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { db, storeId } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    const id = String(fd.get("id") ?? "");
    const name = String(fd.get("name") ?? "");
    if (id) await renameCategory(db, id, name);
    else await createCategory(db, storeId, { name });
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось сохранить категорию"); }
}

export async function deleteCategoryAction(id: string): Promise<Result> {
  try {
    const { db, storeId } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await deleteCategory(db, storeId, id);
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось удалить категорию"); }
}

export async function moveCategoryAction(id: string, dir: "up" | "down"): Promise<Result> {
  try {
    const { db, storeId } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await moveCategory(db, storeId, id, dir);
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось изменить порядок"); }
}

// ── Блюда ──
function readMenuItem(fd: FormData): MenuItemInput {
  return {
    name: String(fd.get("name") ?? ""),
    description: String(fd.get("description") ?? "").trim() || null,
    price: parseRuNumber(fd.get("price")),
    categoryId: String(fd.get("categoryId") ?? "").trim() || null,
    modifierGroupIds: fd.getAll("modifierGroupIds").map(String),
  };
}

export async function saveMenuItemAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { db, storeId } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    const id = String(fd.get("id") ?? "");
    if (id) await updateMenuItem(db, id, storeId, readMenuItem(fd));
    else await createMenuItem(db, storeId, readMenuItem(fd));
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось сохранить блюдо"); }
}

export async function toggleMenuItemActiveAction(id: string, isActive: boolean): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await toggleMenuItemActive(db, id, isActive);
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось изменить"); }
}

export async function deleteMenuItemAction(id: string): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await deleteMenuItem(db, id);
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось удалить блюдо"); }
}

export async function moveMenuItemAction(id: string, dir: "up" | "down"): Promise<Result> {
  try {
    const { db, storeId } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await moveMenuItem(db, storeId, id, dir);
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось изменить порядок"); }
}

// ── Группы модификаторов ──
function readGroup(fd: FormData): ModifierGroupInput {
  return {
    name: String(fd.get("name") ?? ""),
    isRequired: fd.get("isRequired") != null,
    maxChoices: Math.max(1, parseInt(String(fd.get("maxChoices") ?? "1"), 10) || 1),
  };
}

export async function saveModifierGroupAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { db, storeId } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    const id = String(fd.get("id") ?? "");
    if (id) await updateModifierGroup(db, id, readGroup(fd));
    else await createModifierGroup(db, storeId, readGroup(fd));
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось сохранить группу"); }
}

export async function deleteModifierGroupAction(id: string): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await deleteModifierGroup(db, id);
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось удалить группу"); }
}

// ── Модификаторы ──
function readModifier(fd: FormData): ModifierInput {
  return {
    name: String(fd.get("name") ?? ""),
    priceDelta: parseRuNumber(fd.get("priceDelta")),
    addProductId: String(fd.get("addProductId") ?? "").trim() || null,
    addQuantity: fd.get("addQuantity") ? parseRuNumber(fd.get("addQuantity")) : null,
    replacesProductId: String(fd.get("replacesProductId") ?? "").trim() || null,
  };
}

export async function saveModifierAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    const id = String(fd.get("id") ?? "");
    const groupId = String(fd.get("groupId") ?? "");
    if (id) await updateModifier(db, id, readModifier(fd));
    else await createModifier(db, groupId, readModifier(fd));
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось сохранить модификатор"); }
}

export async function deleteModifierAction(id: string): Promise<Result> {
  try {
    const { db } = await requireHorecaApiStoreScope("ADMIN", "OWNER");
    await deleteModifier(db, id);
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (e) { return fail(e, "Не удалось удалить модификатор"); }
}
