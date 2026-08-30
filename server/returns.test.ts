// Возврат по чеку — денежная операция, поэтому проверяем на настоящей базе:
// частичный возврат, полный, защита от повторного возврата сверх проданного и
// изоляция между организациями.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { tenantDb } from "./tenant";
import { commitSale } from "./services/pos";
import { returnSaleItems, ReturnError } from "./services/returns";
import { toNum } from "@/lib/format";

const prisma = new PrismaClient();
let orgId = "", storeId = "", cashierId = "", pA = "", pB = "", saleId = "";
let otherOrgId = "", otherStoreId = "";

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "ТЕСТ-ВОЗВРАТ", type: "RETAIL", stores: { create: { name: "т", address: "а" } } },
    include: { stores: true },
  });
  orgId = org.id;
  storeId = org.stores[0].id;
  const cashier = await prisma.user.create({
    data: { organizationId: orgId, storeId, role: "CASHIER", name: "к", login: `ret-${Date.now()}`, passwordHash: "x" },
  });
  cashierId = cashier.id;
  pA = (await prisma.product.create({ data: { storeId, name: "A", price: 100, costPrice: 50, category: "т", stock: 10 } })).id;
  pB = (await prisma.product.create({ data: { storeId, name: "B", price: 30, costPrice: 10, category: "т", stock: 10 } })).id;

  const other = await prisma.organization.create({
    data: { name: "ТЕСТ-ВОЗВРАТ-ЧУЖОЙ", type: "RETAIL", stores: { create: { name: "т2", address: "а2" } } },
    include: { stores: true },
  });
  otherOrgId = other.id;
  otherStoreId = other.stores[0].id;

  const db = tenantDb(orgId);
  const sale = await commitSale(db, storeId, cashierId, {
    lines: [{ productId: pA, quantity: 3 }, { productId: pB, quantity: 2 }],
    paymentMethod: "CASH", cashGiven: null, isDebt: false,
  });
  saleId = sale.saleId;
});

afterAll(async () => {
  for (const id of [orgId, otherOrgId]) {
    const stores = await prisma.store.findMany({ where: { organizationId: id }, select: { id: true } });
    const sids = stores.map((s) => s.id);
    const pids = (await prisma.product.findMany({ where: { storeId: { in: sids } }, select: { id: true } })).map((p) => p.id);
    const saleIds = (await prisma.sale.findMany({ where: { storeId: { in: sids } }, select: { id: true } })).map((s) => s.id);
    await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.sale.deleteMany({ where: { storeId: { in: sids } } });
    await prisma.product.deleteMany({ where: { storeId: { in: sids } } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.$disconnect();
});

const items = async () =>
  prisma.saleItem.findMany({ where: { saleId }, include: { product: true }, orderBy: { priceAtSale: "desc" } });

describe("возврат по чеку", () => {
  it("частичный возврат возвращает товар на остаток и деньги в чек", async () => {
    const db = tenantDb(orgId);
    const [itemA] = await items();
    const stockBefore = toNum((await prisma.product.findUnique({ where: { id: pA } }))!.stock);

    const res = await returnSaleItems(db, storeId, cashierId, saleId, [{ saleItemId: itemA.id, quantity: 1 }]);

    expect(res.refunded).toBe(100);
    const after = toNum((await prisma.product.findUnique({ where: { id: pA } }))!.stock);
    expect(after).toBe(stockBefore + 1);
    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    expect(toNum(sale!.returnedTotal)).toBe(100);
    expect(sale!.returnedAt).not.toBeNull();
  });

  it("пишет движение склада с понятной причиной", async () => {
    const moves = await prisma.stockMovement.findMany({ where: { productId: pA, type: "IN" } });
    expect(moves.some((m) => (m.reason ?? "").startsWith("возврат по чеку №"))).toBe(true);
  });

  it("не даёт вернуть больше, чем осталось непогашенным", async () => {
    const db = tenantDb(orgId);
    const [itemA] = await items();
    // Продали 3, один уже вернули — доступно 2.
    await expect(returnSaleItems(db, storeId, cashierId, saleId, [{ saleItemId: itemA.id, quantity: 3 }]))
      .rejects.toBeInstanceOf(ReturnError);
  });

  it("отклоняет нулевое и отрицательное количество", async () => {
    const db = tenantDb(orgId);
    const [itemA] = await items();
    await expect(returnSaleItems(db, storeId, cashierId, saleId, [{ saleItemId: itemA.id, quantity: 0 }]))
      .rejects.toBeInstanceOf(ReturnError);
    await expect(returnSaleItems(db, storeId, cashierId, saleId, [{ saleItemId: itemA.id, quantity: -2 }]))
      .rejects.toBeInstanceOf(ReturnError);
  });

  it("чужая организация не может вернуть чужой чек", async () => {
    const foreign = tenantDb(otherOrgId);
    const [itemA] = await items();
    await expect(returnSaleItems(foreign, otherStoreId, cashierId, saleId, [{ saleItemId: itemA.id, quantity: 1 }]))
      .rejects.toBeInstanceOf(ReturnError);
  });

  it("возврат остатка чека доводит его до полного", async () => {
    const db = tenantDb(orgId);
    const list = await items();
    const lines = list
      .map((i) => ({ saleItemId: i.id, quantity: toNum(i.quantity) - toNum(i.returnedQty) }))
      .filter((l) => l.quantity > 0);
    await returnSaleItems(db, storeId, cashierId, saleId, lines);

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    // Продали 3×100 + 2×30 = 360, вернули всё.
    expect(toNum(sale!.returnedTotal)).toBe(360);
    const after = await items();
    expect(after.every((i) => toNum(i.returnedQty) === toNum(i.quantity))).toBe(true);
  });

  it("повторный возврат по полностью возвращённому чеку отклоняется", async () => {
    const db = tenantDb(orgId);
    const [itemA] = await items();
    await expect(returnSaleItems(db, storeId, cashierId, saleId, [{ saleItemId: itemA.id, quantity: 1 }]))
      .rejects.toBeInstanceOf(ReturnError);
  });
});
