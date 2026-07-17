// Чеки точки за день + сотрудники.
import type { TenantDb } from "../tenant";
import { toNum } from "@/lib/format";
import { hash } from "bcryptjs";
import { prisma } from "../db";
import type { Role } from "@prisma/client";

export type ReceiptRow = {
  id: string;
  number: number;
  total: number;
  paymentMethod: "CASH" | "CARD" | "TRANSFER";
  cashier: string;
  createdAt: string;
  itemCount: number;
  items: { name: string; quantity: number; unit: "PCS" | "KG"; priceAtSale: number }[];
};

export async function listReceiptsForDay(db: TenantDb, storeId: string, day?: Date) {
  const base = day ?? new Date();
  const start = new Date(base); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const sales = await db.sale.findMany({
    where: { storeId, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, number: true, total: true, paymentMethod: true, createdAt: true,
      cashier: { select: { name: true } },
      items: { select: { quantity: true, priceAtSale: true, product: { select: { name: true, unit: true } } } },
    },
  });

  const rows: ReceiptRow[] = sales.map((s) => ({
    id: s.id, number: s.number, total: toNum(s.total), paymentMethod: s.paymentMethod,
    cashier: s.cashier.name, createdAt: s.createdAt.toISOString(), itemCount: s.items.length,
    items: s.items.map((i) => ({ name: i.product.name, quantity: toNum(i.quantity), unit: i.product.unit, priceAtSale: toNum(i.priceAtSale) })),
  }));

  const totals = rows.reduce(
    (acc, r) => {
      acc.sum += r.total; acc.count += 1;
      acc[r.paymentMethod] += r.total;
      return acc;
    },
    { sum: 0, count: 0, CASH: 0, CARD: 0, TRANSFER: 0 } as { sum: number; count: number; CASH: number; CARD: number; TRANSFER: number },
  );
  return { rows, totals };
}

export async function listStaff(db: TenantDb, storeId: string) {
  const users = await db.user.findMany({
    where: { OR: [{ storeId }, { role: "OWNER" }] },
    select: { id: true, name: true, login: true, role: true, storeId: true },
    orderBy: { role: "asc" },
  });
  return users;
}

export class StaffError extends Error {}

export async function createStaff(
  db: TenantDb,
  organizationId: string,
  storeId: string,
  input: { name: string; login: string; password: string; role: Role },
) {
  const login = input.login.trim().toLowerCase();
  if (login.length < 3) throw new StaffError("Логин слишком короткий");
  if (input.password.length < 6) throw new StaffError("Пароль минимум 6 символов");
  if (input.role === "OWNER") throw new StaffError("Владельца нельзя создать здесь");
  const exists = await prisma.user.findUnique({ where: { login } });
  if (exists) throw new StaffError("Такой логин уже занят");
  const passwordHash = await hash(input.password, 10);
  // Через tenantDb: organizationId проверяется слоем изоляции
  return db.user.create({
    data: { organizationId, storeId, role: input.role, name: input.name.trim() || login, login, passwordHash },
    select: { id: true, name: true, login: true, role: true },
  });
}
