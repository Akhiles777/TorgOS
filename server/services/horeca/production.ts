// Производство полуфабрикатов: «замесили 8кг теста» — списывает сырьё по
// СОБСТВЕННОМУ рецепту полуфабриката (RecipeLine.ownerProductId), начисляет
// сток самого полуфабриката. В отличие от кассы (payOrder) — недостача
// сырья здесь БЛОКИРУЕТ проведение: это бэк-офис, не гость у кассы,
// ошибку проще исправить до, чем после.
import { Prisma, type Unit } from "@prisma/client";
import type { TenantDb } from "../../tenant";
import { toNum } from "@/lib/format";

export class ProductionError extends Error {}

export type SemiFinishedRow = {
  id: string;
  name: string;
  unit: Unit;
  stock: number;
  costPrice: number;
  recipeLineCount: number;
};

export async function listSemiFinished(db: TenantDb, storeId: string): Promise<SemiFinishedRow[]> {
  const rows = await db.product.findMany({
    where: { storeId, isSemiFinished: true, isActive: true },
    include: { _count: { select: { ownRecipe: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((p) => ({
    id: p.id, name: p.name, unit: p.unit, stock: toNum(p.stock), costPrice: toNum(p.costPrice),
    recipeLineCount: p._count.ownRecipe,
  }));
}

export type ProductionPreviewLine = { productId: string; name: string; unit: Unit; needed: number; available: number; remaining: number; enough: boolean };
export type ProductionPreview = { lines: ProductionPreviewLine[]; unitCost: number; totalCost: number; allEnough: boolean };

async function computeLines(db: TenantDb, productId: string, quantity: number) {
  if (quantity <= 0) throw new ProductionError("Количество должно быть больше нуля");
  const product = await db.product.findFirst({ where: { id: productId }, select: { isSemiFinished: true } });
  if (!product?.isSemiFinished) throw new ProductionError("Товар не отмечен как полуфабрикат");
  const recipe = await db.recipeLine.findMany({
    where: { ownerProductId: productId },
    include: { product: { select: { id: true, name: true, unit: true, stock: true, costPrice: true } } },
  });
  if (!recipe.length) throw new ProductionError("У полуфабриката не задан рецепт — сначала заполните его на вкладке «Рецепты»");
  return recipe.map((rl) => {
    const needed = toNum(rl.quantity) * quantity;
    const available = toNum(rl.product.stock);
    return {
      productId: rl.product.id, name: rl.product.name, unit: rl.product.unit,
      needed, available, remaining: available - needed, enough: available >= needed,
      costPrice: toNum(rl.product.costPrice),
    };
  });
}

export async function previewProduction(db: TenantDb, productId: string, quantity: number): Promise<ProductionPreview> {
  const lines = await computeLines(db, productId, quantity);
  const totalCost = lines.reduce((s, l) => s + l.needed * l.costPrice, 0);
  return {
    lines: lines.map(({ costPrice: _costPrice, ...rest }) => rest),
    unitCost: quantity > 0 ? Math.round((totalCost / quantity) * 100) / 100 : 0,
    totalCost: Math.round(totalCost * 100) / 100,
    allEnough: lines.every((l) => l.enough),
  };
}

export async function produce(db: TenantDb, storeId: string, userId: string, productId: string, quantity: number, comment?: string | null): Promise<string> {
  const lines = await computeLines(db, productId, quantity);
  const notEnough = lines.filter((l) => !l.enough);
  if (notEnough.length) {
    throw new ProductionError(`Не хватает сырья: ${notEnough.map((l) => l.name).join(", ")}`);
  }
  const totalCost = lines.reduce((s, l) => s + l.needed * l.costPrice, 0);
  const unitCost = quantity > 0 ? totalCost / quantity : 0;

  return db.$transaction(async (tx) => {
    for (const l of lines) {
      await tx.product.update({ where: { id: l.productId }, data: { stock: { decrement: new Prisma.Decimal(l.needed.toFixed(3)) } } });
    }
    await tx.stockMovement.createMany({
      data: lines.map((l) => ({
        productId: l.productId, type: "OUT" as const, quantity: new Prisma.Decimal(l.needed.toFixed(3)),
        reason: "производство", userId,
      })),
    });

    const updatedSemi = await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: new Prisma.Decimal(quantity.toFixed(3)) } },
      select: { id: true },
    });
    await tx.stockMovement.create({
      data: { productId: updatedSemi.id, type: "IN", quantity: new Prisma.Decimal(quantity.toFixed(3)), reason: "производство", userId },
    });

    const doc = await tx.productionDoc.create({
      data: {
        storeId, productId, quantity: new Prisma.Decimal(quantity.toFixed(3)),
        unitCost: new Prisma.Decimal(unitCost.toFixed(2)), totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
        userId, comment: comment?.trim() || null,
        lines: {
          create: lines.map((l) => ({
            productId: l.productId, quantity: new Prisma.Decimal(l.needed.toFixed(3)),
            costAtMoment: new Prisma.Decimal(l.costPrice.toFixed(2)),
          })),
        },
      },
      select: { id: true },
    });
    return doc.id;
  });
}

export type ProductionDocRow = {
  id: string;
  number: number;
  productName: string;
  productUnit: Unit;
  quantity: number;
  unitCost: number;
  totalCost: number;
  userName: string;
  comment: string | null;
  createdAt: string;
  lines: { productName: string; quantity: number; unit: Unit }[];
};

export async function listProductionDocs(db: TenantDb, storeId: string, take = 30): Promise<ProductionDocRow[]> {
  const docs = await db.productionDoc.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      product: { select: { name: true, unit: true } },
      user: { select: { name: true } },
      lines: { include: { product: { select: { name: true, unit: true } } } },
    },
  });
  return docs.map((d) => ({
    id: d.id, number: d.number, productName: d.product.name, productUnit: d.product.unit,
    quantity: toNum(d.quantity), unitCost: toNum(d.unitCost), totalCost: toNum(d.totalCost),
    userName: d.user.name, comment: d.comment, createdAt: d.createdAt.toISOString(),
    lines: d.lines.map((l) => ({ productName: l.product.name, quantity: toNum(l.quantity), unit: l.product.unit })),
  }));
}
