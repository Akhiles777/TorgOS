// Тест tenant-изоляции: пользователь организации A не видит и не может
// трогать данные организации B. Гоняется на живой БД (redstore).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb, TenantError } from "./tenant";

const prisma = new PrismaClient();

let orgA = "", orgB = "", storeB = "", productB = "";

beforeAll(async () => {
  const a = await prisma.organization.create({
    data: { name: "ТЕСТ-A", type: "RETAIL", stores: { create: { name: "A-точка", address: "A" } } },
    include: { stores: true },
  });
  const b = await prisma.organization.create({
    data: {
      name: "ТЕСТ-B", type: "HORECA",
      stores: { create: { name: "B-точка", address: "B", products: { create: { name: "Секрет B", price: 100, costPrice: 50, category: "тест", stock: 5 } } } },
    },
    include: { stores: { include: { products: true } } },
  });
  orgA = a.id;
  orgB = b.id;
  storeB = b.stores[0].id;
  productB = b.stores[0].products[0].id;
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.$disconnect();
});

describe("tenant-изоляция", () => {
  it("findMany организации A не показывает товары B", async () => {
    const dbA = tenantDb(orgA);
    const products = await dbA.product.findMany();
    expect(products.find((p) => p.id === productB)).toBeUndefined();
  });

  it("findUnique по id чужого товара возвращает null", async () => {
    const dbA = tenantDb(orgA);
    expect(await dbA.product.findUnique({ where: { id: productB } })).toBeNull();
  });

  it("count у A не считает данные B", async () => {
    const dbA = tenantDb(orgA);
    expect(await dbA.product.count()).toBe(0);
    const dbB = tenantDb(orgB);
    expect(await dbB.product.count()).toBe(1);
  });

  it("update чужого товара бросает TenantError и не меняет данные", async () => {
    const dbA = tenantDb(orgA);
    await expect(dbA.product.update({ where: { id: productB }, data: { price: 1 } })).rejects.toThrow(TenantError);
    const untouched = await prisma.product.findUnique({ where: { id: productB } });
    expect(Number(untouched!.price)).toBe(100);
  });

  it("delete чужого товара бросает TenantError", async () => {
    const dbA = tenantDb(orgA);
    await expect(dbA.product.delete({ where: { id: productB } })).rejects.toThrow(TenantError);
    expect(await prisma.product.findUnique({ where: { id: productB } })).not.toBeNull();
  });

  it("A не может создать товар в чужой точке B", async () => {
    const dbA = tenantDb(orgA);
    await expect(
      dbA.product.create({ data: { storeId: storeB, name: "инъекция", price: 1, costPrice: 1, category: "x", stock: 0 } }),
    ).rejects.toThrow(TenantError);
  });

  it("A не может завести продажу, ссылающуюся на товар B", async () => {
    const dbA = tenantDb(orgA);
    const storeA = (await dbA.store.findFirst())!;
    const cashierA = await prisma.user.create({
      data: { organizationId: orgA, storeId: storeA.id, role: "CASHIER", name: "k", login: `k-${Date.now()}`, passwordHash: "x" },
    });
    await expect(
      dbA.sale.create({
        data: {
          storeId: storeA.id, cashierId: cashierA.id, total: 100, paymentMethod: "CASH",
          items: { create: { productId: productB, quantity: 1, priceAtSale: 100 } },
        },
      }),
    ).rejects.toThrow(TenantError);
  });

  it("updateMany у A не задевает строки B", async () => {
    const dbA = tenantDb(orgA);
    const res = await dbA.product.updateMany({ data: { isActive: false } });
    expect(res.count).toBe(0);
    const stillActive = await prisma.product.findUnique({ where: { id: productB } });
    expect(stillActive!.isActive).toBe(true);
  });
});
