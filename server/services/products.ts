// Сервис товаров точки: список с фильтрами, CRUD, приход/списание, внутренний штрихкод.
import { Prisma, type Unit, type MovementType } from "@prisma/client";
import type { TenantDb } from "../tenant";
import { prisma } from "../db";
import { toNum } from "@/lib/format";
import { internalBarcode, isValidEan13 } from "@/lib/ean13";

export type ProductRow = {
  id: string;
  barcode: string | null;
  name: string;
  price: number;
  costPrice: number;
  unit: Unit;
  category: string;
  stock: number;
  expiry: string | null;
  isActive: boolean;
  marginPct: number;
};

function row(p: {
  id: string; barcode: string | null; name: string; price: Prisma.Decimal; costPrice: Prisma.Decimal;
  unit: Unit; category: string; stock: Prisma.Decimal; expiry: Date | null; isActive: boolean;
}): ProductRow {
  const price = toNum(p.price), cost = toNum(p.costPrice);
  return {
    id: p.id, barcode: p.barcode, name: p.name, price, costPrice: cost, unit: p.unit,
    category: p.category, stock: toNum(p.stock), expiry: p.expiry ? p.expiry.toISOString().slice(0, 10) : null,
    isActive: p.isActive, marginPct: price > 0 ? Math.round(((price - cost) / price) * 100) : 0,
  };
}

export type ProductFilter = "all" | "low" | "expiring" | "inactive";

export async function listProducts(db: TenantDb, storeId: string, filter: ProductFilter, q?: string): Promise<ProductRow[]> {
  const soon = new Date(Date.now() + 5 * 86_400_000);
  const where: Prisma.ProductWhereInput = { storeId };
  if (filter === "inactive") where.isActive = false;
  else where.isActive = true;
  if (filter === "expiring") where.expiry = { not: null, lte: soon };
  if (q?.trim()) where.OR = [{ name: { contains: q.trim(), mode: "insensitive" } }, { barcode: { contains: q.trim() } }];

  const rows = await db.product.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }] });
  let mapped = rows.map(row);
  // «Мало» зависит от единицы — фильтруем после выборки
  if (filter === "low") mapped = mapped.filter((p) => p.stock <= (p.unit === "KG" ? 1 : 3));
  return mapped;
}

export type ProductInput = {
  name: string;
  price: number;
  costPrice: number;
  unit: Unit;
  category: string;
  barcode?: string | null;
  expiry?: string | null;
  stock?: number;
};

export class ProductError extends Error {}

async function nextInternalBarcode(storeId: string): Promise<string> {
  // Берём максимум среди уже выданных внутренних кодов этого магазина
  const count = await prisma.product.count({ where: { storeId, barcode: { startsWith: "2" } } });
  let seq = count + 1;
  // На всякий случай проверяем коллизию
  for (let i = 0; i < 50; i++) {
    const code = internalBarcode(seq);
    const exists = await prisma.product.findFirst({ where: { storeId, barcode: code }, select: { id: true } });
    if (!exists) return code;
    seq++;
  }
  throw new ProductError("Не удалось выделить внутренний штрихкод");
}

export async function createProduct(db: TenantDb, storeId: string, input: ProductInput): Promise<ProductRow> {
  if (!input.name.trim()) throw new ProductError("Укажите название");
  if (input.price < 0 || input.costPrice < 0) throw new ProductError("Цена не может быть отрицательной");

  let barcode = input.barcode?.trim() || null;
  if (barcode && !isValidEan13(barcode)) throw new ProductError("Штрихкод должен быть валидным EAN-13 (13 цифр)");
  // Развесной без штрихкода — генерируем внутренний EAN-13 (для печати ярлыка)
  if (!barcode && input.unit === "KG") barcode = await nextInternalBarcode(storeId);
  if (barcode) {
    const dup = await db.product.findFirst({ where: { storeId, barcode }, select: { id: true } });
    if (dup) throw new ProductError("Такой штрихкод уже есть в этой точке");
  }

  const created = await db.product.create({
    data: {
      storeId, name: input.name.trim(), price: new Prisma.Decimal(input.price.toFixed(2)),
      costPrice: new Prisma.Decimal(input.costPrice.toFixed(2)), unit: input.unit, category: input.category.trim() || "Прочее",
      barcode, expiry: input.expiry ? new Date(input.expiry) : null, stock: new Prisma.Decimal((input.stock ?? 0).toFixed(3)),
    },
  });
  return row(created);
}

export async function updateProduct(db: TenantDb, id: string, input: ProductInput): Promise<ProductRow> {
  if (!input.name.trim()) throw new ProductError("Укажите название");
  const barcode = input.barcode?.trim() || null;
  if (barcode && !isValidEan13(barcode)) throw new ProductError("Штрихкод должен быть валидным EAN-13");
  const updated = await db.product.update({
    where: { id },
    data: {
      name: input.name.trim(), price: new Prisma.Decimal(input.price.toFixed(2)),
      costPrice: new Prisma.Decimal(input.costPrice.toFixed(2)), unit: input.unit,
      category: input.category.trim() || "Прочее", barcode, expiry: input.expiry ? new Date(input.expiry) : null,
    },
  });
  return row(updated);
}

export async function setActive(db: TenantDb, id: string, isActive: boolean) {
  await db.product.update({ where: { id }, data: { isActive } });
}

// Приход/списание — атомарно меняем stock и пишем движение.
export async function moveStock(db: TenantDb, id: string, userId: string, type: MovementType, quantity: number, reason?: string) {
  if (quantity <= 0) throw new ProductError("Количество должно быть больше нуля");
  const qty = new Prisma.Decimal(quantity.toFixed(3));
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id }, select: { stock: true } });
    if (!product) throw new ProductError("Товар не найден");
    const delta = type === "IN" ? qty : qty.negated();
    if (toNum(product.stock) + toNum(delta) < 0) throw new ProductError("Нельзя списать больше, чем есть на остатке");
    await tx.product.update({ where: { id }, data: { stock: { increment: delta } } });
    await tx.stockMovement.create({ data: { productId: id, type, quantity: qty, reason: reason?.trim() || null, userId } });
  });
}
