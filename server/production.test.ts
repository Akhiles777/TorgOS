// Производство полуфабрикатов: атомарное списание сырья + начисление
// полуфабриката, блокировка при нехватке (в отличие от кассы — см. horeca.test.ts).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "./tenant";
import { produce, previewProduction, ProductionError } from "./services/horeca/production";

const prisma = new PrismaClient();
let orgId = "", storeId = "", userId = "";
let flourId = "", waterId = "", doughId = "";

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "ТЕСТ-PRODUCTION", type: "HORECA", stores: { create: { name: "т", address: "а" } } },
    include: { stores: true },
  });
  orgId = org.id;
  storeId = org.stores[0].id;
  const owner = await prisma.user.create({
    data: { organizationId: orgId, storeId, role: "OWNER", name: "o", login: `production-${Date.now()}`, passwordHash: "x" },
  });
  userId = owner.id;

  const flour = await prisma.product.create({ data: { storeId, name: "Мука", price: 0, costPrice: 40, category: "сырьё", stock: 10, unit: "KG" } });
  const water = await prisma.product.create({ data: { storeId, name: "Вода", price: 0, costPrice: 0, category: "сырьё", stock: 10, unit: "L" } });
  flourId = flour.id; waterId = water.id;

  const dough = await prisma.product.create({ data: { storeId, name: "Тесто", price: 0, costPrice: 0, category: "п/ф", stock: 0, unit: "KG", isSemiFinished: true } });
  doughId = dough.id;
  // на 1кг теста: 0.6кг муки + 0.4л воды
  await prisma.recipeLine.create({ data: { ownerProductId: doughId, productId: flourId, quantity: 0.6 } });
  await prisma.recipeLine.create({ data: { ownerProductId: doughId, productId: waterId, quantity: 0.4 } });
});

afterAll(async () => {
  await prisma.productionLine.deleteMany({ where: { doc: { storeId } } });
  await prisma.productionDoc.deleteMany({ where: { storeId } });
  await prisma.stockMovement.deleteMany({ where: { product: { storeId } } });
  await prisma.recipeLine.deleteMany({ where: { product: { storeId } } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("produce — производство полуфабриката", () => {
  it("превью считает расход и общую себестоимость без записи в БД", async () => {
    const db = tenantDb(orgId);
    const preview = await previewProduction(db, doughId, 5);
    expect(preview.allEnough).toBe(true);
    // 5кг теста: 3кг муки (120₽) + 2л воды (0₽) = 120₽ всего, 24₽/кг
    expect(preview.totalCost).toBe(120);
    expect(preview.unitCost).toBe(24);
    const flour = await prisma.product.findUnique({ where: { id: flourId }, select: { stock: true } });
    expect(Number(flour!.stock)).toBe(10); // превью не списывает
  });

  it("проведение атомарно: списывает сырьё, начисляет полуфабрикат, пишет ProductionDoc+ProductionLine", async () => {
    const db = tenantDb(orgId);
    const docId = await produce(db, storeId, userId, doughId, 5);
    expect(docId).toBeTruthy();

    const [flour, water, dough, doc] = await Promise.all([
      prisma.product.findUnique({ where: { id: flourId }, select: { stock: true } }),
      prisma.product.findUnique({ where: { id: waterId }, select: { stock: true } }),
      prisma.product.findUnique({ where: { id: doughId }, select: { stock: true } }),
      prisma.productionDoc.findUnique({ where: { id: docId }, include: { lines: true } }),
    ]);
    expect(Number(flour!.stock)).toBe(7); // 10 - 3
    expect(Number(water!.stock)).toBe(8); // 10 - 2
    expect(Number(dough!.stock)).toBe(5); // 0 + 5
    expect(Number(doc!.totalCost)).toBe(120);
    expect(Number(doc!.unitCost)).toBe(24);
    expect(doc!.lines.length).toBe(2);

    const moves = await prisma.stockMovement.count({ where: { product: { storeId } } });
    expect(moves).toBe(3); // OUT мука, OUT вода, IN тесто
  });

  it("недостаточно сырья: производство блокируется, ничего не меняется (атомарность)", async () => {
    const db = tenantDb(orgId);
    const before = await Promise.all([
      prisma.product.findUnique({ where: { id: flourId }, select: { stock: true } }),
      prisma.productionDoc.count({ where: { storeId } }),
    ]);
    // Остаток муки после предыдущего теста — 7кг, на 20кг теста нужно 12кг муки — не хватит по факту дальше по цепочке (воды тоже не хватит: нужно 8л, есть 8 — впритык хватит, мука — блокер)
    await expect(produce(db, storeId, userId, doughId, 20)).rejects.toThrow(ProductionError);

    const after = await Promise.all([
      prisma.product.findUnique({ where: { id: flourId }, select: { stock: true } }),
      prisma.productionDoc.count({ where: { storeId } }),
    ]);
    expect(after[0]!.stock).toEqual(before[0]!.stock); // остаток не тронут
    expect(after[1]).toBe(before[1]); // новый документ не создан
  });

  it("товар без рецепта или не отмеченный полуфабрикатом — понятная ошибка", async () => {
    const db = tenantDb(orgId);
    const plain = await prisma.product.create({ data: { storeId, name: "Обычный товар", price: 100, costPrice: 50, category: "т", stock: 5 } });
    await expect(produce(db, storeId, userId, plain.id, 1)).rejects.toThrow(ProductionError);
    await prisma.product.delete({ where: { id: plain.id } });
  });
});
