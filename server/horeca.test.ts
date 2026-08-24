// Оплата заказа общепита: ровно один Sale, ноль SaleItem, корректное
// списание ингредиентов по рецепту с учётом модификаторов, атомарность.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "./tenant";
import { payOrder, createOrderDraft, OrderError } from "./services/horeca/orders";

const prisma = new PrismaClient();
let orgId = "", storeId = "", userId = "";
let cowMilkId = "", oatMilkId = "", coffeeId = "", latteId = "", groupId = "", oatModifierId = "";

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "ТЕСТ-HORECA-PAY", type: "HORECA", stores: { create: { name: "т", address: "а" } } },
    include: { stores: true },
  });
  orgId = org.id;
  storeId = org.stores[0].id;

  const owner = await prisma.user.create({
    data: { organizationId: orgId, storeId, role: "OWNER", name: "o", login: `horeca-pay-${Date.now()}`, passwordHash: "x" },
  });
  userId = owner.id;

  const cowMilk = await prisma.product.create({ data: { storeId, name: "Молоко коровье", price: 0, costPrice: 60, category: "сырьё", stock: 10, unit: "L" } });
  const oatMilk = await prisma.product.create({ data: { storeId, name: "Молоко овсяное", price: 0, costPrice: 90, category: "сырьё", stock: 5, unit: "L" } });
  const coffee = await prisma.product.create({ data: { storeId, name: "Кофе зерно", price: 0, costPrice: 800, category: "сырьё", stock: 2, unit: "KG" } });
  cowMilkId = cowMilk.id; oatMilkId = oatMilk.id; coffeeId = coffee.id;

  const latte = await prisma.menuItem.create({ data: { storeId, name: "Латте", price: 250 } });
  latteId = latte.id;
  await prisma.recipeLine.create({ data: { menuItemId: latteId, productId: coffeeId, quantity: 0.018 } });
  await prisma.recipeLine.create({ data: { menuItemId: latteId, productId: cowMilkId, quantity: 0.2 } });

  const group = await prisma.modifierGroup.create({ data: { storeId, name: "Молоко", isRequired: false, maxChoices: 1 } });
  groupId = group.id;
  await prisma.menuItemModifierGroup.create({ data: { menuItemId: latteId, groupId } });
  const oatMod = await prisma.modifier.create({ data: { groupId, name: "Овсяное молоко", priceDelta: 30, replacesProductId: cowMilkId, addProductId: oatMilkId, addQuantity: 0.2 } });
  oatModifierId = oatMod.id;
});

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { product: { storeId } } });
  await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
  await prisma.order.deleteMany({ where: { storeId } });
  await prisma.modifier.deleteMany({ where: { group: { storeId } } });
  await prisma.menuItemModifierGroup.deleteMany({ where: { menuItem: { storeId } } });
  await prisma.modifierGroup.deleteMany({ where: { storeId } });
  await prisma.recipeLine.deleteMany({ where: { product: { storeId } } });
  await prisma.saleItem.deleteMany({ where: { sale: { storeId } } });
  await prisma.sale.deleteMany({ where: { storeId } });
  await prisma.menuItem.deleteMany({ where: { storeId } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

async function snapshot() {
  const [cowMilk, oatMilk, coffee, sales, saleItems, orders, moves] = await Promise.all([
    prisma.product.findUnique({ where: { id: cowMilkId }, select: { stock: true } }),
    prisma.product.findUnique({ where: { id: oatMilkId }, select: { stock: true } }),
    prisma.product.findUnique({ where: { id: coffeeId }, select: { stock: true } }),
    prisma.sale.count({ where: { storeId } }),
    prisma.saleItem.count({ where: { sale: { storeId } } }),
    prisma.order.count({ where: { storeId } }),
    prisma.stockMovement.count({ where: { product: { storeId } } }),
  ]);
  return { cowMilk: Number(cowMilk!.stock), oatMilk: Number(oatMilk!.stock), coffee: Number(coffee!.stock), sales, saleItems, orders, moves };
}

describe("payOrder — оплата заказа общепита", () => {
  it("оплата «с ходу» (без предварительного «Отложить»): один Sale, ноль SaleItem, ингредиенты по рецепту без модификатора", async () => {
    const db = tenantDb(orgId);
    const before = await snapshot();
    const res = await payOrder(db, storeId, userId, null, { lines: [{ menuItemId: latteId, quantity: 1, modifierIds: [] }] }, { paymentMethod: "CASH" });
    expect(res.total).toBe(250);
    expect(res.warnings).toEqual([]);

    const after = await snapshot();
    expect(after.sales).toBe(before.sales + 1);
    expect(after.saleItems).toBe(before.saleItems); // SaleItem НЕ создаются для общепита
    expect(after.orders).toBe(before.orders + 1);
    expect(after.coffee).toBeCloseTo(before.coffee - 0.018, 5);
    expect(after.cowMilk).toBeCloseTo(before.cowMilk - 0.2, 5); // обычное коровье молоко списано
    expect(after.oatMilk).toBe(before.oatMilk); // овсяное не трогали — модификатор не выбирался
    expect(after.moves).toBe(before.moves + 2); // по одному движению на кофе и молоко

    const sale = await prisma.sale.findFirst({ where: { storeId }, orderBy: { createdAt: "desc" } });
    const order = await prisma.order.findFirst({ where: { storeId }, orderBy: { createdAt: "desc" } });
    expect(order!.status).toBe("PAID");
    expect(order!.saleId).toBe(sale!.id);
  });

  it("модификатор «Овсяное молоко» (replaces+add): списывается овсяное, коровье НЕ трогается", async () => {
    const db = tenantDb(orgId);
    const before = await snapshot();
    const res = await payOrder(
      db, storeId, userId, null,
      { lines: [{ menuItemId: latteId, quantity: 2, modifierIds: [oatModifierId] }] },
      { paymentMethod: "TRANSFER" },
    );
    expect(res.total).toBe((250 + 30) * 2); // 2 латте с доплатой за овсяное молоко

    const after = await snapshot();
    expect(after.cowMilk).toBe(before.cowMilk); // базовое коровье молоко пропущено (replaces)
    expect(after.oatMilk).toBeCloseTo(before.oatMilk - 0.2 * 2, 5); // овсяное добавлено (add), на 2 порции
    expect(after.coffee).toBeCloseTo(before.coffee - 0.018 * 2, 5);
  });

  it("«Отложить» → оплата существующего заказа: тот же Order, не создаётся второй", async () => {
    const db = tenantDb(orgId);
    const orderId = await createOrderDraft(db, storeId, userId, null, [{ menuItemId: latteId, quantity: 1, modifierIds: [] }]);
    const before = await snapshot();
    const res = await payOrder(db, storeId, userId, null, { orderId }, { paymentMethod: "CASH", cashGiven: 300 });
    expect(res.changeGiven).toBe(50);

    const after = await snapshot();
    expect(after.orders).toBe(before.orders); // заказ уже существовал, новый не создан
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe("PAID");
  });

  it("недостаточно остатка ингредиента: продажа проходит с предупреждением, а не блокируется", async () => {
    const db = tenantDb(orgId);
    // Кофе почти кончился — спишем оставшееся почти в ноль перед тестом
    await prisma.product.update({ where: { id: coffeeId }, data: { stock: 0.01 } });
    const res = await payOrder(db, storeId, userId, null, { lines: [{ menuItemId: latteId, quantity: 1, modifierIds: [] }] }, { paymentMethod: "CASH" });
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain("Кофе зерно");
    const coffee = await prisma.product.findUnique({ where: { id: coffeeId }, select: { stock: true } });
    expect(Number(coffee!.stock)).toBeLessThan(0); // ушёл в минус, но продажа не заблокирована
  });

  it("ошибка (пустой заказ) не оставляет частичных записей", async () => {
    const db = tenantDb(orgId);
    const before = await snapshot();
    await expect(payOrder(db, storeId, userId, null, { lines: [] }, { paymentMethod: "CASH" })).rejects.toThrow(OrderError);
    expect(await snapshot()).toEqual(before);
  });
});
