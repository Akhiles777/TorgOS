// Себестоимость общепита: расчёт по рецепту, распространение при смене
// costPrice ингредиента, двухуровневая цепочка сырьё→полуфабрикат→блюдо,
// защита от циклов. Гоняется на живой БД (redstore), как остальные server-тесты.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "./tenant";
import { updateProduct } from "./services/products";
import {
  addOrUpdateRecipeLine, setSemiFinished, RecipeError,
} from "./services/horeca/costing";

const prisma = new PrismaClient();
let orgId = "", storeId = "";
let flourId = "", waterId = "", doughId = "", pizzaId = "";

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "ТЕСТ-COSTING", type: "HORECA", stores: { create: { name: "т", address: "а" } } },
    include: { stores: true },
  });
  orgId = org.id;
  storeId = org.stores[0].id;

  const flour = await prisma.product.create({ data: { storeId, name: "Мука", price: 0, costPrice: 40, category: "сырьё", stock: 100, unit: "KG" } });
  const water = await prisma.product.create({ data: { storeId, name: "Вода", price: 0, costPrice: 0, category: "сырьё", stock: 100, unit: "L" } });
  flourId = flour.id;
  waterId = water.id;

  const dough = await prisma.product.create({ data: { storeId, name: "Тесто", price: 0, costPrice: 0, category: "п/ф", stock: 0, unit: "KG" } });
  doughId = dough.id;

  const pizza = await prisma.menuItem.create({ data: { storeId, name: "Пицца Маргарита", price: 500 } });
  pizzaId = pizza.id;
});

afterAll(async () => {
  await prisma.recipeLine.deleteMany({ where: { product: { storeId } } });
  await prisma.menuItem.deleteMany({ where: { storeId } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("себестоимость по рецепту", () => {
  it("себестоимость блюда = Σ(costPrice ингредиента × quantity)", async () => {
    const db = tenantDb(orgId);
    // Пицца: 0.3кг муки (40₽/кг) + 0.2л воды (0₽/л) = 12₽
    await addOrUpdateRecipeLine(db, { menuItemId: pizzaId }, flourId, 0.3);
    await addOrUpdateRecipeLine(db, { menuItemId: pizzaId }, waterId, 0.2);
    const item = await prisma.menuItem.findUnique({ where: { id: pizzaId }, select: { cachedCost: true } });
    expect(Number(item!.cachedCost)).toBe(12);
  });

  it("рецепт полуфабриката: setSemiFinished считает costPrice по его собственному рецепту", async () => {
    const db = tenantDb(orgId);
    await setSemiFinished(db, doughId, true);
    // Тесто (на 1кг): 0.6кг муки (40₽) + 0.4л воды (0₽) = 24₽/кг
    await addOrUpdateRecipeLine(db, { ownerProductId: doughId }, flourId, 0.6);
    await addOrUpdateRecipeLine(db, { ownerProductId: doughId }, waterId, 0.4);
    const dough = await prisma.product.findUnique({ where: { id: doughId }, select: { costPrice: true, isSemiFinished: true } });
    expect(dough!.isSemiFinished).toBe(true);
    expect(Number(dough!.costPrice)).toBe(24);
  });

  it("двухуровневая цепочка: смена costPrice муки распространяется на тесто И на пиццу, если пицца использует тесто", async () => {
    const db = tenantDb(orgId);
    // Добавляем тесто как ингредиент пиццы вместо прямой муки/воды — реальный сценарий использования п/ф
    await addOrUpdateRecipeLine(db, { menuItemId: pizzaId }, doughId, 0.25); // 0.25кг теста по 24₽/кг = 6₽
    const before = await prisma.menuItem.findUnique({ where: { id: pizzaId }, select: { cachedCost: true } });
    // пицца сейчас: 12 (мука+вода напрямую) + 6 (тесто) = 18
    expect(Number(before!.cachedCost)).toBe(18);

    // Мука подорожала: 40 → 60₽/кг
    await updateProduct(db, flourId, {
      name: "Мука", price: 0, costPrice: 60, unit: "KG", category: "сырьё",
    });

    // Тесто должно пересчитаться: 0.6×60 + 0.4×0 = 36₽/кг
    const dough = await prisma.product.findUnique({ where: { id: doughId }, select: { costPrice: true } });
    expect(Number(dough!.costPrice)).toBe(36);

    // Пицца должна пересчитаться дважды: прямая мука (0.3×60=18) + вода (0) + тесто (0.25×36=9) = 27
    const pizza = await prisma.menuItem.findUnique({ where: { id: pizzaId }, select: { cachedCost: true } });
    expect(Number(pizza!.cachedCost)).toBe(27);
  });

  it("цикл отклоняется: тесто не может содержать пиццу, если бы пицца была п/ф — здесь проверяем прямой цикл A→A и B→A→B", async () => {
    const db = tenantDb(orgId);
    // Прямой цикл: тесто не может быть ингредиентом самого себя
    await expect(addOrUpdateRecipeLine(db, { ownerProductId: doughId }, doughId, 1)).rejects.toThrow(RecipeError);

    // Косвенный цикл: соус использует тесто, тесто не может начать использовать соус
    const sauce = await prisma.product.create({ data: { storeId, name: "Соус", price: 0, costPrice: 0, category: "п/ф", stock: 0, unit: "KG" } });
    await setSemiFinished(db, sauce.id, true);
    await addOrUpdateRecipeLine(db, { ownerProductId: sauce.id }, doughId, 0.1); // соус ← тесто (ок)
    await expect(addOrUpdateRecipeLine(db, { ownerProductId: doughId }, sauce.id, 0.1)).rejects.toThrow(RecipeError); // тесто ← соус (цикл!)
  });

  it("удаление всех строк рецепта возвращает cachedCost в null («рецепт не задан»)", async () => {
    const db = tenantDb(orgId);
    const lines = await prisma.recipeLine.findMany({ where: { menuItemId: pizzaId } });
    for (const l of lines) await prisma.recipeLine.delete({ where: { id: l.id } });
    // Прямое удаление через prisma (не через сервис) не триггерит recalc —
    // проверяем именно сервисный путь через removeRecipeLine на отдельной строке.
    const db2 = tenantDb(orgId);
    await addOrUpdateRecipeLine(db2, { menuItemId: pizzaId }, flourId, 1);
    const withLine = await prisma.menuItem.findUnique({ where: { id: pizzaId }, select: { cachedCost: true } });
    expect(withLine!.cachedCost).not.toBeNull();

    const { removeRecipeLine } = await import("./services/horeca/costing");
    const line = await prisma.recipeLine.findFirst({ where: { menuItemId: pizzaId } });
    await removeRecipeLine(db2, line!.id);
    const after = await prisma.menuItem.findUnique({ where: { id: pizzaId }, select: { cachedCost: true } });
    expect(after!.cachedCost).toBeNull();
  });
});
