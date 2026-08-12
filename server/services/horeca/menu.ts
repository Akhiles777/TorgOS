// Меню общепита: категории, блюда, общие (переиспользуемые) группы модификаторов.
// Себестоимость (cachedCost) здесь только читается — считает и пересчитывает
// server/services/horeca/costing.ts (экран /admin/recipes, следующий шаг).
import { Prisma } from "@prisma/client";
import type { TenantDb } from "../../tenant";
import { toNum } from "@/lib/format";

export class MenuError extends Error {}

export type MenuCategoryRow = { id: string; name: string; position: number; isActive: boolean; itemCount: number };

export type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  position: number;
  categoryId: string | null;
  categoryName: string | null;
  // null = рецепт ещё не задан (см. /admin/recipes) — это не то же самое, что 0.
  cachedCost: number | null;
  // Наценка на себестоимость: (price − cost) / cost × 100.
  markupPct: number | null;
  // Фудкост: доля себестоимости в цене, cost / price × 100 — мелкая подсказка рядом.
  foodCostPct: number | null;
  modifierGroupIds: string[];
};

export type ModifierRow = {
  id: string;
  name: string;
  priceDelta: number;
  addProductId: string | null;
  addProductName: string | null;
  addQuantity: number | null;
  replacesProductId: string | null;
  replacesProductName: string | null;
  position: number;
  isActive: boolean;
};

export type ModifierGroupRow = {
  id: string;
  name: string;
  isRequired: boolean;
  maxChoices: number;
  modifiers: ModifierRow[];
  usedByCount: number;
};

function categoryRow(c: { id: string; name: string; position: number; isActive: boolean; _count: { items: number } }): MenuCategoryRow {
  return { id: c.id, name: c.name, position: c.position, isActive: c.isActive, itemCount: c._count.items };
}

function menuItemRow(m: {
  id: string; name: string; description: string | null; price: Prisma.Decimal; isActive: boolean; position: number;
  categoryId: string | null; category: { name: string } | null; cachedCost: Prisma.Decimal | null;
  modifierGroups: { groupId: string }[];
}): MenuItemRow {
  const price = toNum(m.price);
  const cost = m.cachedCost != null ? toNum(m.cachedCost) : null;
  return {
    id: m.id, name: m.name, description: m.description, price, isActive: m.isActive, position: m.position,
    categoryId: m.categoryId, categoryName: m.category?.name ?? null,
    cachedCost: cost,
    // markupPct остаётся null и когда cost===0 (наценка математически не определена
    // — деление на ноль); UI отличает «рецепт не задан» (cachedCost===null) от
    // «рецепт есть, но бесплатный» (cachedCost===0) по самому полю cachedCost.
    markupPct: cost != null && cost > 0 ? Math.round(((price - cost) / cost) * 100) : null,
    foodCostPct: cost != null && price > 0 ? Math.round((cost / price) * 100) : null,
    modifierGroupIds: m.modifierGroups.map((g) => g.groupId),
  };
}

function modifierRow(m: {
  id: string; name: string; priceDelta: Prisma.Decimal; addProductId: string | null; addProduct: { name: string } | null;
  addQuantity: Prisma.Decimal | null; replacesProductId: string | null; replacesProduct: { name: string } | null;
  position: number; isActive: boolean;
}): ModifierRow {
  return {
    id: m.id, name: m.name, priceDelta: toNum(m.priceDelta),
    addProductId: m.addProductId, addProductName: m.addProduct?.name ?? null,
    addQuantity: m.addQuantity != null ? toNum(m.addQuantity) : null,
    replacesProductId: m.replacesProductId, replacesProductName: m.replacesProduct?.name ?? null,
    position: m.position, isActive: m.isActive,
  };
}

const MENU_ITEM_INCLUDE = {
  category: { select: { name: true } },
  modifierGroups: { select: { groupId: true } },
} as const;

export async function listCategories(db: TenantDb, storeId: string): Promise<MenuCategoryRow[]> {
  const rows = await db.menuCategory.findMany({
    where: { storeId },
    include: { _count: { select: { items: true } } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map(categoryRow);
}

export async function listMenuItems(db: TenantDb, storeId: string): Promise<MenuItemRow[]> {
  const rows = await db.menuItem.findMany({
    where: { storeId },
    include: MENU_ITEM_INCLUDE,
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map(menuItemRow);
}

export async function listModifierGroups(db: TenantDb, storeId: string): Promise<ModifierGroupRow[]> {
  const rows = await db.modifierGroup.findMany({
    where: { storeId },
    include: {
      modifiers: { include: { addProduct: { select: { name: true } }, replacesProduct: { select: { name: true } } }, orderBy: { position: "asc" } },
      _count: { select: { menuItems: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((g) => ({
    id: g.id, name: g.name, isRequired: g.isRequired, maxChoices: g.maxChoices,
    modifiers: g.modifiers.map(modifierRow), usedByCount: g._count.menuItems,
  }));
}

// ── Категории ──────────────────────────────────────────────────────────
export type CategoryInput = { name: string };

export async function createCategory(db: TenantDb, storeId: string, input: CategoryInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new MenuError("Укажите название категории");
  const maxPos = await db.menuCategory.aggregate({ where: { storeId }, _max: { position: true } });
  try {
    await db.menuCategory.create({ data: { storeId, name, position: (maxPos._max.position ?? -1) + 1 } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new MenuError("Такая категория уже есть");
    throw e;
  }
}

export async function renameCategory(db: TenantDb, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new MenuError("Укажите название категории");
  try {
    await db.menuCategory.update({ where: { id }, data: { name: trimmed } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new MenuError("Такая категория уже есть");
    throw e;
  }
}

export async function deleteCategory(db: TenantDb, storeId: string, id: string): Promise<void> {
  // Блюда категории не теряются — categoryId просто обнулится (onDelete: SetNull),
  // попадут в «Без категории».
  await db.menuCategory.delete({ where: { id } });
  void storeId;
}

export async function moveCategory(db: TenantDb, storeId: string, id: string, dir: "up" | "down"): Promise<void> {
  const cats = await db.menuCategory.findMany({ where: { storeId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, position: true } });
  const idx = cats.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= cats.length) return;
  const a = cats[idx], b = cats[swapIdx];
  await db.$transaction([
    db.menuCategory.update({ where: { id: a.id }, data: { position: b.position } }),
    db.menuCategory.update({ where: { id: b.id }, data: { position: a.position } }),
  ]);
}

// ── Блюда ──────────────────────────────────────────────────────────────
export type MenuItemInput = {
  name: string;
  description?: string | null;
  price: number;
  categoryId?: string | null;
  modifierGroupIds: string[];
};

async function assertGroupsBelongToStore(db: TenantDb, storeId: string, groupIds: string[]): Promise<void> {
  if (!groupIds.length) return;
  const count = await db.modifierGroup.count({ where: { id: { in: groupIds }, storeId } });
  if (count !== groupIds.length) throw new MenuError("Часть групп модификаторов недоступна");
}

export async function createMenuItem(db: TenantDb, storeId: string, input: MenuItemInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new MenuError("Укажите название блюда");
  if (input.price < 0) throw new MenuError("Цена не может быть отрицательной");
  await assertGroupsBelongToStore(db, storeId, input.modifierGroupIds);
  const maxPos = await db.menuItem.aggregate({ where: { storeId }, _max: { position: true } });
  await db.menuItem.create({
    data: {
      storeId, name, description: input.description?.trim() || null,
      price: new Prisma.Decimal(input.price.toFixed(2)), categoryId: input.categoryId || null,
      position: (maxPos._max.position ?? -1) + 1,
      modifierGroups: { create: input.modifierGroupIds.map((groupId, i) => ({ groupId, position: i })) },
    },
  });
}

export async function updateMenuItem(db: TenantDb, id: string, storeId: string, input: MenuItemInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new MenuError("Укажите название блюда");
  if (input.price < 0) throw new MenuError("Цена не может быть отрицательной");
  await assertGroupsBelongToStore(db, storeId, input.modifierGroupIds);
  await db.$transaction([
    db.menuItem.update({
      where: { id },
      data: {
        name, description: input.description?.trim() || null,
        price: new Prisma.Decimal(input.price.toFixed(2)), categoryId: input.categoryId || null,
      },
    }),
    db.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } }),
    db.menuItemModifierGroup.createMany({ data: input.modifierGroupIds.map((groupId, i) => ({ menuItemId: id, groupId, position: i })) }),
  ]);
}

export async function toggleMenuItemActive(db: TenantDb, id: string, isActive: boolean): Promise<void> {
  await db.menuItem.update({ where: { id }, data: { isActive } });
}

export async function deleteMenuItem(db: TenantDb, id: string): Promise<void> {
  const sold = await db.orderItem.count({ where: { menuItemId: id } });
  if (sold > 0) {
    throw new MenuError("Блюдо уже есть в заказах — удалить нельзя, снимите его с продажи вместо этого.");
  }
  await db.menuItem.delete({ where: { id } });
}

export async function moveMenuItem(db: TenantDb, storeId: string, id: string, dir: "up" | "down"): Promise<void> {
  const item = await db.menuItem.findUnique({ where: { id }, select: { categoryId: true } });
  if (!item) return;
  const siblings = await db.menuItem.findMany({
    where: { storeId, categoryId: item.categoryId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, position: true },
  });
  const idx = siblings.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const a = siblings[idx], b = siblings[swapIdx];
  await db.$transaction([
    db.menuItem.update({ where: { id: a.id }, data: { position: b.position } }),
    db.menuItem.update({ where: { id: b.id }, data: { position: a.position } }),
  ]);
}

// ── Группы модификаторов (общая библиотека) ──────────────────────────────
export type ModifierGroupInput = { name: string; isRequired: boolean; maxChoices: number };

export async function createModifierGroup(db: TenantDb, storeId: string, input: ModifierGroupInput): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new MenuError("Укажите название группы");
  if (input.maxChoices < 1) throw new MenuError("Максимум выборов должен быть не меньше 1");
  const group = await db.modifierGroup.create({ data: { storeId, name, isRequired: input.isRequired, maxChoices: input.maxChoices } });
  return group.id;
}

export async function updateModifierGroup(db: TenantDb, id: string, input: ModifierGroupInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new MenuError("Укажите название группы");
  if (input.maxChoices < 1) throw new MenuError("Максимум выборов должен быть не меньше 1");
  await db.modifierGroup.update({ where: { id }, data: { name, isRequired: input.isRequired, maxChoices: input.maxChoices } });
}

export async function deleteModifierGroup(db: TenantDb, id: string): Promise<void> {
  // MenuItemModifierGroup/Modifier каскадно удалятся вместе с группой (onDelete: Cascade).
  // Исторические чеки не страдают — там снимок в OrderItem.modifiers (Json), не FK.
  await db.modifierGroup.delete({ where: { id } });
}

// ── Модификаторы внутри группы ────────────────────────────────────────
export type ModifierInput = {
  name: string;
  priceDelta: number;
  addProductId?: string | null;
  addQuantity?: number | null;
  replacesProductId?: string | null;
};

export async function createModifier(db: TenantDb, groupId: string, input: ModifierInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new MenuError("Укажите название модификатора");
  if (input.addProductId && (input.addQuantity == null || input.addQuantity <= 0)) {
    throw new MenuError("Для добавляемого ингредиента укажите количество больше нуля");
  }
  const maxPos = await db.modifier.aggregate({ where: { groupId }, _max: { position: true } });
  await db.modifier.create({
    data: {
      groupId, name, priceDelta: new Prisma.Decimal(input.priceDelta.toFixed(2)),
      addProductId: input.addProductId || null,
      addQuantity: input.addProductId && input.addQuantity != null ? new Prisma.Decimal(input.addQuantity.toFixed(3)) : null,
      replacesProductId: input.replacesProductId || null,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });
}

export async function updateModifier(db: TenantDb, id: string, input: ModifierInput): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new MenuError("Укажите название модификатора");
  if (input.addProductId && (input.addQuantity == null || input.addQuantity <= 0)) {
    throw new MenuError("Для добавляемого ингредиента укажите количество больше нуля");
  }
  await db.modifier.update({
    where: { id },
    data: {
      name, priceDelta: new Prisma.Decimal(input.priceDelta.toFixed(2)),
      addProductId: input.addProductId || null,
      addQuantity: input.addProductId && input.addQuantity != null ? new Prisma.Decimal(input.addQuantity.toFixed(3)) : null,
      replacesProductId: input.replacesProductId || null,
    },
  });
}

export async function deleteModifier(db: TenantDb, id: string): Promise<void> {
  await db.modifier.delete({ where: { id } });
}
