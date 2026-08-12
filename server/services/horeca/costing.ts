// Рецепты и себестоимость общепита.
//
// Ключевое соглашение: RecipeLine.quantity — количество ингредиента НА ОДНУ
// ЕДИНИЦУ владельца рецепта (на 1 блюдо, либо на 1 unit полуфабриката —
// например «на 1 кг теста»). Отдельного поля «выход рецепта» поэтому не
// нужно: себестоимость единицы полуфабриката — это прямая сумма
// Σ(ingredientCostPrice × quantity) по его собственным строкам рецепта, без
// деления. При производстве (/admin/production, следующий шаг) строки просто
// масштабируются на количество произведённого.
import { Prisma, type Unit } from "@prisma/client";
import type { TenantDb } from "../../tenant";
import { toNum } from "@/lib/format";

export class RecipeError extends Error {}

type Owner = { menuItemId: string } | { ownerProductId: string };

export type RecipeOwnerSummary = {
  id: string;
  name: string;
  kind: "dish" | "semiProduct";
  price: number | null;
  cost: number | null;
  lineCount: number;
};

export async function listRecipeOwners(db: TenantDb, storeId: string): Promise<{ dishes: RecipeOwnerSummary[]; semiProducts: RecipeOwnerSummary[] }> {
  const [items, semis] = await Promise.all([
    db.menuItem.findMany({ where: { storeId }, include: { _count: { select: { recipe: true } } }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { storeId, isSemiFinished: true }, include: { _count: { select: { ownRecipe: true } } }, orderBy: { name: "asc" } }),
  ]);
  return {
    dishes: items.map((i) => ({
      id: i.id, name: i.name, kind: "dish" as const, price: toNum(i.price),
      cost: i.cachedCost != null ? toNum(i.cachedCost) : null, lineCount: i._count.recipe,
    })),
    semiProducts: semis.map((p) => ({
      id: p.id, name: p.name, kind: "semiProduct" as const, price: null,
      cost: toNum(p.costPrice), lineCount: p._count.ownRecipe,
    })),
  };
}

export type RecipeLineDetail = {
  id: string;
  productId: string;
  productName: string;
  productUnit: Unit;
  productIsSemiFinished: boolean;
  ingredientCostPrice: number;
  quantity: number;
  lineCost: number;
};

export async function getRecipeLines(db: TenantDb, owner: Owner): Promise<RecipeLineDetail[]> {
  const where = "menuItemId" in owner ? { menuItemId: owner.menuItemId } : { ownerProductId: owner.ownerProductId };
  const lines = await db.recipeLine.findMany({
    where, include: { product: { select: { name: true, unit: true, costPrice: true, isSemiFinished: true } } },
    orderBy: { createdAt: "asc" },
  });
  return lines.map((l) => {
    const quantity = toNum(l.quantity), cp = toNum(l.product.costPrice);
    return {
      id: l.id, productId: l.productId, productName: l.product.name, productUnit: l.product.unit,
      productIsSemiFinished: l.product.isSemiFinished, ingredientCostPrice: cp, quantity,
      lineCost: Math.round(quantity * cp * 100) / 100,
    };
  });
}

// Проверяет, что добавление ingredientId в рецепт ownerProductId не создаст
// цикл (полуфабрикат, прямо или через цепочку, содержащий сам себя).
async function wouldCreateCycle(db: TenantDb, ownerProductId: string, ingredientId: string, depth = 0): Promise<boolean> {
  if (ownerProductId === ingredientId) return true;
  if (depth > 10) return true; // защитный потолок — такой глубины рецептов на практике не бывает
  const lines = await db.recipeLine.findMany({ where: { ownerProductId: ingredientId }, select: { productId: true } });
  for (const l of lines) {
    if (await wouldCreateCycle(db, ownerProductId, l.productId, depth + 1)) return true;
  }
  return false;
}

export async function addOrUpdateRecipeLine(db: TenantDb, owner: Owner, productId: string, quantity: number): Promise<void> {
  if (quantity <= 0) throw new RecipeError("Количество должно быть больше нуля");
  if ("ownerProductId" in owner) {
    if (owner.ownerProductId === productId) throw new RecipeError("Ингредиент не может совпадать с самим полуфабрикатом");
    if (await wouldCreateCycle(db, owner.ownerProductId, productId)) {
      throw new RecipeError("Этот ингредиент уже содержит текущий полуфабрикат в своём рецепте — получится цикл");
    }
  }
  const qty = new Prisma.Decimal(quantity.toFixed(3));
  if ("menuItemId" in owner) {
    await db.recipeLine.upsert({
      where: { menuItemId_productId: { menuItemId: owner.menuItemId, productId } },
      create: { menuItemId: owner.menuItemId, productId, quantity: qty },
      update: { quantity: qty },
    });
  } else {
    await db.recipeLine.upsert({
      where: { ownerProductId_productId: { ownerProductId: owner.ownerProductId, productId } },
      create: { ownerProductId: owner.ownerProductId, productId, quantity: qty },
      update: { quantity: qty },
    });
  }
  await recalcOwner(db, owner);
}

export async function removeRecipeLine(db: TenantDb, id: string): Promise<void> {
  const line = await db.recipeLine.findFirst({ where: { id }, select: { menuItemId: true, ownerProductId: true } });
  if (!line) return;
  await db.recipeLine.delete({ where: { id } });
  await recalcOwner(db, line.menuItemId ? { menuItemId: line.menuItemId } : { ownerProductId: line.ownerProductId! });
}

export async function setRecipeLineQuantity(db: TenantDb, id: string, quantity: number): Promise<void> {
  if (quantity <= 0) throw new RecipeError("Количество должно быть больше нуля");
  const line = await db.recipeLine.update({
    where: { id }, data: { quantity: new Prisma.Decimal(quantity.toFixed(3)) },
    select: { menuItemId: true, ownerProductId: true },
  });
  await recalcOwner(db, line.menuItemId ? { menuItemId: line.menuItemId } : { ownerProductId: line.ownerProductId! });
}

export async function setSemiFinished(db: TenantDb, productId: string, flag: boolean): Promise<void> {
  await db.product.update({ where: { id: productId }, data: { isSemiFinished: flag } });
  if (flag) {
    await recalcSemiProductCost(db, productId);
    await recalcDependents(db, [productId]);
  }
}

async function recalcOwner(db: TenantDb, owner: Owner): Promise<void> {
  if ("menuItemId" in owner) {
    await recalcMenuItemCost(db, owner.menuItemId);
  } else {
    await recalcSemiProductCost(db, owner.ownerProductId);
    await recalcDependents(db, [owner.ownerProductId]);
  }
}

export async function recalcMenuItemCost(db: TenantDb, menuItemId: string): Promise<void> {
  const lines = await db.recipeLine.findMany({ where: { menuItemId }, include: { product: { select: { costPrice: true } } } });
  if (!lines.length) {
    await db.menuItem.update({ where: { id: menuItemId }, data: { cachedCost: null, cachedCostAt: null } });
    return;
  }
  const total = lines.reduce((sum, l) => sum + toNum(l.quantity) * toNum(l.product.costPrice), 0);
  await db.menuItem.update({
    where: { id: menuItemId },
    data: { cachedCost: new Prisma.Decimal(total.toFixed(2)), cachedCostAt: new Date() },
  });
}

export async function recalcSemiProductCost(db: TenantDb, productId: string): Promise<void> {
  const product = await db.product.findFirst({ where: { id: productId }, select: { isSemiFinished: true } });
  if (!product?.isSemiFinished) return; // считаем себестоимость только для помеченных полуфабрикатов
  const lines = await db.recipeLine.findMany({ where: { ownerProductId: productId }, include: { product: { select: { costPrice: true } } } });
  const total = lines.reduce((sum, l) => sum + toNum(l.quantity) * toNum(l.product.costPrice), 0);
  await db.product.update({ where: { id: productId }, data: { costPrice: new Prisma.Decimal(total.toFixed(2)) } });
}

// Пересчитывает всё, что зависит от себестоимости товаров из changedProductIds:
// блюда (лист, дальше не каскадируется) и полуфабрикаты (могут сами быть
// чьим-то ингредиентом — каскадируется рекурсивно, глубина ограничена).
export async function recalcDependents(db: TenantDb, changedProductIds: string[], depth = 0): Promise<void> {
  if (!changedProductIds.length || depth > 5) return;

  const menuUsages = await db.recipeLine.findMany({
    where: { productId: { in: changedProductIds }, menuItemId: { not: null } },
    select: { menuItemId: true }, distinct: ["menuItemId"],
  });
  for (const { menuItemId } of menuUsages) {
    if (menuItemId) await recalcMenuItemCost(db, menuItemId);
  }

  const semiUsages = await db.recipeLine.findMany({
    where: { productId: { in: changedProductIds }, ownerProductId: { not: null } },
    select: { ownerProductId: true }, distinct: ["ownerProductId"],
  });
  const changedNext: string[] = [];
  for (const { ownerProductId } of semiUsages) {
    if (!ownerProductId) continue;
    const before = await db.product.findFirst({ where: { id: ownerProductId }, select: { costPrice: true, isSemiFinished: true } });
    if (!before?.isSemiFinished) continue;
    await recalcSemiProductCost(db, ownerProductId);
    const after = await db.product.findFirst({ where: { id: ownerProductId }, select: { costPrice: true } });
    if (after && toNum(before.costPrice) !== toNum(after.costPrice)) changedNext.push(ownerProductId);
  }
  if (changedNext.length) await recalcDependents(db, changedNext, depth + 1);
}
