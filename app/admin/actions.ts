"use server";
import { revalidatePath } from "next/cache";
import { requireApi } from "@/server/guard";
import {
  createProduct, updateProduct, setActive, moveStock, ProductError, type ProductInput,
} from "@/server/services/products";
import { createStaff, StaffError } from "@/server/services/receipts";
import type { MovementType, Role, Unit } from "@prisma/client";

type Result = { ok: true } | { ok: false; error: string };

function readProduct(fd: FormData): ProductInput {
  return {
    name: String(fd.get("name") ?? ""),
    price: Number(fd.get("price") ?? 0),
    costPrice: Number(fd.get("costPrice") ?? 0),
    unit: (String(fd.get("unit") ?? "PCS") as Unit),
    category: String(fd.get("category") ?? ""),
    barcode: (String(fd.get("barcode") ?? "").trim() || null),
    expiry: (String(fd.get("expiry") ?? "").trim() || null),
    stock: fd.get("stock") != null ? Number(fd.get("stock")) : 0,
  };
}

export async function saveProductAction(_prev: unknown, fd: FormData): Promise<Result> {
  try {
    const { user, db } = await requireApi("ADMIN", "OWNER");
    if (!user.storeId) return { ok: false, error: "Нет точки" };
    const id = String(fd.get("id") ?? "");
    if (id) await updateProduct(db, id, readProduct(fd));
    else await createProduct(db, user.storeId, readProduct(fd));
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    if (e instanceof ProductError) return { ok: false, error: e.message };
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
    const quantity = Number(fd.get("quantity") ?? 0);
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
    const { user, db } = await requireApi("ADMIN", "OWNER");
    if (!user.storeId) return { ok: false, error: "Нет точки" };
    await createStaff(db, user.organizationId, user.storeId, {
      name: String(fd.get("name") ?? ""),
      login: String(fd.get("login") ?? ""),
      password: String(fd.get("password") ?? ""),
      role: (String(fd.get("role") ?? "CASHIER") as Role),
    });
    revalidatePath("/admin/staff");
    return { ok: true };
  } catch (e) {
    if (e instanceof StaffError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Не удалось добавить сотрудника" };
  }
}
