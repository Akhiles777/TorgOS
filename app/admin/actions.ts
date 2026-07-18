"use server";
import { revalidatePath } from "next/cache";
import { requireApi, requireApiStoreScope, AuthError } from "@/server/guard";
import {
  createProduct, updateProduct, setActive, moveStock, ProductError, type ProductInput,
} from "@/server/services/products";
import { createStaff, StaffError } from "@/server/services/receipts";
import { createEmployee, deactivateEmployee, ShiftError } from "@/server/services/shift";
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
