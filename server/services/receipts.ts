// Чеки точки за день + сотрудники.
import type { TenantDb } from "../tenant";
import { toNum } from "@/lib/format";
import { hash } from "bcryptjs";
import { prisma } from "../db";
import type { Role, Unit } from "@prisma/client";

export type ReceiptRow = {
  id: string;
  number: number;
  total: number;
  paymentMethod: "CASH" | "CARD" | "TRANSFER";
  cashier: string;
  createdAt: string;
  itemCount: number;
  // Сколько денег по этому чеку уже вернули (0 — возвратов не было).
  returnedTotal: number;
  // Возврат делается по конкретной строке чека, поэтому нужен её id и то,
  // сколько из неё уже вернули.
  items: {
    id: string; name: string; quantity: number; unit: Unit; priceAtSale: number; returnedQty: number;
  }[];
};

export async function listReceiptsForDay(db: TenantDb, storeId: string, day?: Date) {
  const base = day ?? new Date();
  const start = new Date(base); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const sales = await db.sale.findMany({
    where: { storeId, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, number: true, total: true, paymentMethod: true, createdAt: true, returnedTotal: true,
      cashier: { select: { name: true } },
      employee: { select: { name: true } },
      items: {
        select: {
          id: true, quantity: true, priceAtSale: true, returnedQty: true,
          product: { select: { name: true, unit: true } },
        },
      },
    },
  });

  const rows: ReceiptRow[] = sales.map((s) => ({
    id: s.id, number: s.number, total: toNum(s.total), paymentMethod: s.paymentMethod,
    // Показываем, кто был на смене; если смена не выбиралась — логин-аккаунт.
    cashier: s.employee?.name ?? s.cashier.name, createdAt: s.createdAt.toISOString(), itemCount: s.items.length,
    returnedTotal: toNum(s.returnedTotal),
    items: s.items.map((i) => ({
      id: i.id, name: i.product.name, quantity: toNum(i.quantity), unit: i.product.unit,
      priceAtSale: toNum(i.priceAtSale), returnedQty: toNum(i.returnedQty),
    })),
  }));

  // Итоги дня считаем ЗА ВЫЧЕТОМ возвратов: в кассе к концу дня лежит именно
  // столько. Отдельной строкой показываем, сколько вернули, — иначе разница
  // между «пробито» и «в кассе» выглядит как ошибка.
  const totals = rows.reduce(
    (acc, r) => {
      const net = r.total - r.returnedTotal;
      acc.sum += net; acc.count += 1;
      acc.returned += r.returnedTotal;
      acc[r.paymentMethod] += net;
      return acc;
    },
    { sum: 0, count: 0, returned: 0, CASH: 0, CARD: 0, TRANSFER: 0 },
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
