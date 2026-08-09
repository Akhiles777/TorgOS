// Инвентаризация: пересчёт остатков по точке через сканер. Один активный
// сеанс на точку. Пока сеанс открыт — сканы копят «факт», база не трогается;
// применяются расхождения только по явному «Завершить и применить».
import { Prisma } from "@prisma/client";
import type { TenantDb } from "../tenant";
import { toNum } from "@/lib/format";

export class InventoryError extends Error {}

export type InventoryLineRow = {
  id: string;
  productId: string;
  name: string;
  unit: "PCS" | "KG";
  expectedQty: number;
  countedQty: number;
  countedAt: string;
};

export type InventorySessionRow = {
  id: string;
  startedAt: string;
  startedByName: string;
  lines: InventoryLineRow[];
};

function lineRow(l: { id: string; productId: string; expectedQty: Prisma.Decimal; countedQty: Prisma.Decimal; countedAt: Date; product: { name: string; unit: "PCS" | "KG" } }): InventoryLineRow {
  return {
    id: l.id,
    productId: l.productId,
    name: l.product.name,
    unit: l.product.unit,
    expectedQty: toNum(l.expectedQty),
    countedQty: toNum(l.countedQty),
    countedAt: l.countedAt.toISOString(),
  };
}

export async function getActiveSession(db: TenantDb, storeId: string): Promise<InventorySessionRow | null> {
  const session = await db.inventorySession.findFirst({
    where: { storeId, finishedAt: null },
    orderBy: { startedAt: "desc" },
    include: { startedBy: { select: { name: true } }, lines: { include: { product: { select: { name: true, unit: true } } }, orderBy: { countedAt: "asc" } } },
  });
  if (!session) return null;
  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    startedByName: session.startedBy.name,
    lines: session.lines.map(lineRow),
  };
}

export async function startSession(db: TenantDb, storeId: string, userId: string): Promise<string> {
  const active = await db.inventorySession.findFirst({ where: { storeId, finishedAt: null }, select: { id: true } });
  if (active) throw new InventoryError("Инвентаризация уже идёт — заверши её или отмени, прежде чем начинать новую");
  const session = await db.inventorySession.create({ data: { storeId, startedById: userId } });
  return session.id;
}

type FoundProduct = { id: string; name: string; unit: "PCS" | "KG"; stock: Prisma.Decimal };

// Общая логика зачёта одной позиции — используется и сканом по штрихкоду,
// и ручным добавлением по поиску (товары без штрихкода: овощи, зелень).
// Штучные — новая строка сразу считается за 1, либо +1 к уже отсканированной;
// развесные требуют явный вес — вводится один раз, не копится повторами.
async function applyCount(
  db: TenantDb,
  sessionId: string,
  product: FoundProduct,
  weightKg?: number,
): Promise<{ line: InventoryLineRow; productName: string }> {
  const existing = await db.inventoryLine.findFirst({
    where: { sessionId, productId: product.id },
    include: { product: { select: { name: true, unit: true } } },
  });

  if (product.unit === "KG") {
    if (weightKg == null || weightKg <= 0) throw new InventoryError("Укажите вес");
    const countedQty = new Prisma.Decimal(weightKg.toFixed(3));
    const line = existing
      ? await db.inventoryLine.update({
          where: { id: existing.id },
          data: { countedQty, countedAt: new Date() },
          include: { product: { select: { name: true, unit: true } } },
        })
      : await db.inventoryLine.create({
          data: { sessionId, productId: product.id, expectedQty: product.stock, countedQty },
          include: { product: { select: { name: true, unit: true } } },
        });
    return { line: lineRow(line), productName: product.name };
  }

  // PCS: +1 за скан/добавление
  const line = existing
    ? await db.inventoryLine.update({
        where: { id: existing.id },
        data: { countedQty: { increment: 1 }, countedAt: new Date() },
        include: { product: { select: { name: true, unit: true } } },
      })
    : await db.inventoryLine.create({
        data: { sessionId, productId: product.id, expectedQty: product.stock, countedQty: new Prisma.Decimal(1) },
        include: { product: { select: { name: true, unit: true } } },
      });
  return { line: lineRow(line), productName: product.name };
}

// weightKg передаётся, только когда клиент уже знает, что товар развесной
// (после предварительного /api/admin/lookup) и успел спросить вес — на сам
// скан это не завязано, штрихкод веса не несёт.
export async function scanItem(
  db: TenantDb,
  storeId: string,
  sessionId: string,
  barcode: string,
  weightKg?: number,
): Promise<{ line: InventoryLineRow; productName: string } | { notFound: true }> {
  const product = await db.product.findFirst({ where: { storeId, barcode: barcode.trim() }, select: { id: true, name: true, unit: true, stock: true } });
  if (!product) return { notFound: true };
  return applyCount(db, sessionId, product, weightKg);
}

// Добавление без сканирования — по productId (товар выбран поиском). Тот же
// путь, что и findByBarcode-скан, только источник товара другой — нужен для
// позиций без штрихкода (развесные овощи/зелень) и как ручной фолбэк вообще.
export async function addManualLine(
  db: TenantDb,
  sessionId: string,
  productId: string,
  weightKg?: number,
): Promise<{ line: InventoryLineRow; productName: string }> {
  const product = await db.product.findFirst({ where: { id: productId }, select: { id: true, name: true, unit: true, stock: true } });
  if (!product) throw new InventoryError("Товар не найден");
  return applyCount(db, sessionId, product, weightKg);
}

// Ручная правка факта — опечатался при подсчёте, не обязательно пересканировать.
export async function setLineCount(db: TenantDb, lineId: string, countedQty: number): Promise<void> {
  if (countedQty < 0) throw new InventoryError("Количество не может быть отрицательным");
  await db.inventoryLine.update({ where: { id: lineId }, data: { countedQty: new Prisma.Decimal(countedQty.toFixed(3)), countedAt: new Date() } });
}

export async function removeLine(db: TenantDb, lineId: string): Promise<void> {
  await db.inventoryLine.delete({ where: { id: lineId } });
}

// Сеанс без применения — ничего в остатках не меняли, просто передумали.
export async function cancelSession(db: TenantDb, sessionId: string): Promise<void> {
  await db.inventorySession.delete({ where: { id: sessionId } });
}

export type ApplyResult = { applied: number; unchanged: number };

// Завершение: для каждой расходящейся строки — движение (WRITEOFF при
// недостаче, IN при излишке) с причиной «инвентаризация» и новый Product.stock
// строго равный факту. Одна транзакция — расхождения применяются все разом.
export async function finishSession(db: TenantDb, sessionId: string, userId: string): Promise<ApplyResult> {
  const session = await db.inventorySession.findFirst({ where: { id: sessionId }, include: { lines: true } });
  if (!session) throw new InventoryError("Сессия не найдена");
  if (session.finishedAt) throw new InventoryError("Уже завершена");

  let applied = 0;
  let unchanged = 0;
  await db.$transaction(async (tx) => {
    for (const line of session.lines) {
      const expected = toNum(line.expectedQty);
      const counted = toNum(line.countedQty);
      const delta = Math.round((counted - expected) * 1000) / 1000;
      if (delta === 0) {
        unchanged++;
        continue;
      }
      applied++;
      await tx.product.update({ where: { id: line.productId }, data: { stock: line.countedQty } });
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          type: delta > 0 ? "IN" : "WRITEOFF",
          quantity: new Prisma.Decimal(Math.abs(delta).toFixed(3)),
          reason: "инвентаризация",
          userId,
        },
      });
    }
    await tx.inventorySession.update({ where: { id: sessionId }, data: { finishedAt: new Date() } });
  });

  return { applied, unchanged };
}
