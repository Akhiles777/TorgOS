// Проверяем целостность данных при продаже: успех атомарен, а любая ошибка
// (нехватка остатка, чужой товар) НЕ оставляет частичных записей — всё
// откатывается. Это гарантия «при багах данные целы».
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "./tenant";
import { commitSale, PosError } from "./services/pos";

const prisma = new PrismaClient();
let orgId = "", storeId = "", cashierId = "", pA = "", pB = "";

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: {
      name: "ТЕСТ-POS", type: "RETAIL",
      stores: { create: { name: "т", address: "а" } },
    },
    include: { stores: true },
  });
  orgId = org.id;
  storeId = org.stores[0].id;
  const cashier = await prisma.user.create({
    data: { organizationId: orgId, storeId, role: "CASHIER", name: "к", login: `pos-${Date.now()}`, passwordHash: "x" },
  });
  cashierId = cashier.id;
  const a = await prisma.product.create({ data: { storeId, name: "A", price: 100, costPrice: 50, category: "т", stock: 10 } });
  const b = await prisma.product.create({ data: { storeId, name: "B", price: 30, costPrice: 10, category: "т", stock: 2 } });
  pA = a.id; pB = b.id;
});

afterAll(async () => {
  // Порядок важен: StockMovement/Sale ссылаются на User с Restrict (защита истории),
  // поэтому сначала удаляем историю, потом пользователей и организацию.
  await prisma.saleItem.deleteMany({ where: { sale: { storeId } } });
  await prisma.sale.deleteMany({ where: { storeId } });
  await prisma.stockMovement.deleteMany({ where: { product: { storeId } } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

async function snapshot() {
  const [stockA, stockB, sales, items, moves] = await Promise.all([
    prisma.product.findUnique({ where: { id: pA }, select: { stock: true } }),
    prisma.product.findUnique({ where: { id: pB }, select: { stock: true } }),
    prisma.sale.count({ where: { storeId } }),
    prisma.saleItem.count({ where: { sale: { storeId } } }),
    prisma.stockMovement.count({ where: { product: { storeId } } }),
  ]);
  return { a: Number(stockA!.stock), b: Number(stockB!.stock), sales, items, moves };
}

describe("целостность продажи", () => {
  it("успешная продажа списывает остаток и пишет чек+движения атомарно", async () => {
    const db = tenantDb(orgId);
    const before = await snapshot();
    const res = await commitSale(db, storeId, cashierId, { lines: [{ productId: pA, quantity: 2 }], paymentMethod: "CARD" });
    expect(res.total).toBe(200);
    const after = await snapshot();
    expect(after.a).toBe(before.a - 2);
    expect(after.sales).toBe(before.sales + 1);
    expect(after.items).toBe(before.items + 1);
    expect(after.moves).toBe(before.moves + 1);
  });

  it("нехватка остатка (2-й товар) откатывает ВСЮ транзакцию — ничего не записано", async () => {
    const db = tenantDb(orgId);
    const before = await snapshot();
    // A хватает, B (остаток 2) просят 5 — должно упасть и откатить списание A
    await expect(
      commitSale(db, storeId, cashierId, {
        lines: [{ productId: pA, quantity: 1 }, { productId: pB, quantity: 5 }],
        paymentMethod: "CARD",
      }),
    ).rejects.toThrow(PosError);
    const after = await snapshot();
    expect(after).toEqual(before); // остатки и счётчики не изменились
  });

  it("наличными меньше суммы — отказ без записи", async () => {
    const db = tenantDb(orgId);
    const before = await snapshot();
    await expect(
      commitSale(db, storeId, cashierId, { lines: [{ productId: pA, quantity: 1 }], paymentMethod: "CASH", cashGiven: 10 }),
    ).rejects.toThrow(PosError);
    expect(await snapshot()).toEqual(before);
  });

  it("пустой чек отклоняется", async () => {
    const db = tenantDb(orgId);
    await expect(commitSale(db, storeId, cashierId, { lines: [], paymentMethod: "CARD" })).rejects.toThrow(PosError);
  });
});
