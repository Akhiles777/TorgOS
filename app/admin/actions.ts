"use server";
import { revalidatePath } from "next/cache";
import { requireApi, requireApiStoreScope, AuthError } from "@/server/guard";
import {
  createProduct, updateProduct, setActive, moveStock, deleteProduct, ProductError, type ProductInput,
} from "@/server/services/products";
import { createStaff, StaffError } from "@/server/services/receipts";
import { createEmployee, deactivateEmployee, ShiftError } from "@/server/services/shift";
import { lookupBarcode, BarcodeLookupError } from "@/server/ai/barcodeLookup";
import { reserveAiLookups, AiBudgetError } from "@/server/ai/aiBudget";
import { isValidBarcode } from "@/lib/ean13";
import { parseRuNumber } from "@/lib/format";
import type { MovementType, Role, Unit } from "@prisma/client";

type Result = { ok: true } | { ok: false; error: string };

export async function createEmployeeAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    await createEmployee(db, storeId, String(fd.get("name") ?? ""));
    revalidatePath("/admin/staff");
    return { ok: true };
  } catch (e) {
    if (e instanceof ShiftError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось добавить сотрудника смены" };
  }
}

export async function deactivateEmployeeAction(id: string): Promise<Result> {
  try {
    const { db } = await requireApi("ADMIN", "OWNER");
    await deactivateEmployee(db, id);
    revalidatePath("/admin/staff");
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось убрать сотрудника" };
  }
}

function readProduct(fd: FormData): ProductInput {
  return {
    name: String(fd.get("name") ?? ""),
    price: parseRuNumber(fd.get("price")),
    costPrice: parseRuNumber(fd.get("costPrice")),
    unit: (String(fd.get("unit") ?? "PCS") as Unit),
    category: String(fd.get("category") ?? ""),
    barcode: (String(fd.get("barcode") ?? "").trim() || null),
    expiry: (String(fd.get("expiry") ?? "").trim() || null),
    stock: parseRuNumber(fd.get("stock")),
    showInPos: fd.get("showInPos") != null, // чекбокс: есть в форме = включён
  };
}

export async function saveProductAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const id = String(fd.get("id") ?? "");
    if (id) await updateProduct(db, id, readProduct(fd));
    else await createProduct(db, storeId, readProduct(fd));
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    if (e instanceof ProductError) return { ok: false, error: e.message };
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось сохранить товар" };
  }
}

// Быстрое добавление товара: продавец вводит штрихкод (и цену — отдельно
// в форме), ИИ предполагает название и категорию. Результат только
// предзаполняет форму — ничего не сохраняется здесь, человек проверяет и
// правит перед «Сохранить» (см. ProductModal в ProductsManager.tsx).
export async function lookupBarcodeAction(barcode: string): Promise<{ ok: true; name: string; category: string } | { ok: false; error: string }> {
  try {
    const { db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    const clean = barcode.trim();
    if (!isValidBarcode(clean)) return { ok: false, error: "Некорректный штрихкод (нужен EAN-13 или EAN-8)" };
    // Уже знакомый штрихкод — отвечаем из базы, не тратя платный запрос.
    const own = await db.product.findFirst({ where: { storeId, barcode: clean }, select: { name: true, category: true } });
    if (own) return { ok: true, name: own.name, category: own.category };

    // 2 — на случай углублённого второго захода по ненайденному.
    reserveAiLookups(storeId, 2);
    const rows = await db.product.findMany({ where: { storeId }, select: { category: true }, distinct: ["category"] });
    const result = await lookupBarcode(clean, rows.map((r) => r.category).filter(Boolean));
    if (!result.found) return { ok: false, error: `${result.error}. Впишите название сами.` };
    return { ok: true, name: result.name, category: result.category };
  } catch (e) {
    if (e instanceof AiBudgetError) return { ok: false, error: e.message };
    if (e instanceof BarcodeLookupError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось определить товар" };
  }
}

export async function toggleActiveAction(id: string, isActive: boolean): Promise<Result> {
  try {
    const { db } = await requireApi("ADMIN", "OWNER");
    await setActive(db, id, isActive);
    revalidatePath("/admin");
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось изменить" };
  }
}

// Удаление товара из базы. Проданные товары защищены — сервис вернёт ошибку,
// а UI предложит снять с продажи вместо удаления.
export async function deleteProductAction(id: string): Promise<Result> {
  try {
    const { db } = await requireApi("ADMIN", "OWNER");
    await deleteProduct(db, id);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    if (e instanceof ProductError || e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось удалить товар" };
  }
}

export async function moveStockAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { user, db } = await requireApi("ADMIN", "OWNER");
    const id = String(fd.get("id") ?? "");
    const type = String(fd.get("type") ?? "IN") as MovementType;
    const quantity = parseRuNumber(fd.get("quantity"));
    const reason = String(fd.get("reason") ?? "");
    await moveStock(db, id, user.id, type, quantity, reason);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    if (e instanceof ProductError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось выполнить движение" };
  }
}

export async function createStaffAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { user, db, storeId } = await requireApiStoreScope("ADMIN", "OWNER");
    await createStaff(db, user.organizationId, storeId, {
      name: String(fd.get("name") ?? ""),
      login: String(fd.get("login") ?? ""),
      password: String(fd.get("password") ?? ""),
      role: (String(fd.get("role") ?? "CASHIER") as Role),
    });
    revalidatePath("/admin/staff");
    return { ok: true };
  } catch (e) {
    if (e instanceof StaffError) return { ok: false, error: e.message };
    if (e instanceof AuthError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось добавить сотрудника" };
  }
}
